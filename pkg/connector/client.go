package connector

import (
	"context"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
	"maunium.net/go/mautrix/bridgev2"
	"maunium.net/go/mautrix/bridgev2/database"
	"maunium.net/go/mautrix/bridgev2/networkid"
	"maunium.net/go/mautrix/bridgev2/status"
	"maunium.net/go/mautrix/event"
)

// Compile-time interface checks
var (
	_ bridgev2.NetworkAPI                  = (*ZaloClient)(nil)
	_ bridgev2.ReactionHandlingNetworkAPI  = (*ZaloClient)(nil)
	_ bridgev2.RedactionHandlingNetworkAPI = (*ZaloClient)(nil)
)

// ZaloClient implements NetworkAPI for a single user login.
type ZaloClient struct {
	connector *ZaloConnector
	userLogin *bridgev2.UserLogin
	meta      *UserLoginMetadata
	sidecar   *SidecarClient

	wsConn   *websocket.Conn
	wsMu     sync.Mutex
	wsCancel context.CancelFunc
	loggedIn bool
	log      zerolog.Logger
}

func (c *ZaloClient) Connect(ctx context.Context) {
	c.log = zerolog.Ctx(ctx).With().Str("component", "zalo_client").Logger()

	// Try to restore session via cookie login
	if c.meta.Cookie != "" {
		_, err := c.sidecar.LoginCookie(ctx, c.meta.Cookie, c.meta.IMEI, c.meta.UserAgent)
		if err != nil {
			c.log.Err(err).Msg("Failed to restore Zalo session via cookie")
			c.userLogin.BridgeState.Send(status.BridgeState{
				StateEvent: status.StateBadCredentials,
				Error:      "zalo-cookie-expired",
				Message:    "Zalo session expired, please re-login",
			})
			return
		}
	}

	// Connect WebSocket
	if err := c.connectWS(ctx); err != nil {
		c.log.Err(err).Msg("Failed to connect WebSocket to sidecar")
		return
	}

	wsCtx, cancel := context.WithCancel(context.Background())
	c.wsCancel = cancel
	go c.wsReadLoop(wsCtx)

	c.loggedIn = true
	c.userLogin.BridgeState.Send(status.BridgeState{StateEvent: status.StateConnected})
}

func (c *ZaloClient) Disconnect() {
	c.loggedIn = false
	if c.wsCancel != nil {
		c.wsCancel()
	}
	c.wsMu.Lock()
	defer c.wsMu.Unlock()
	if c.wsConn != nil {
		_ = c.wsConn.Close()
		c.wsConn = nil
	}
}

func (c *ZaloClient) IsLoggedIn() bool {
	return c.loggedIn
}

func (c *ZaloClient) LogoutRemote(ctx context.Context) {
	_ = c.sidecar.Logout(ctx)
	c.Disconnect()
}

func (c *ZaloClient) IsThisUser(_ context.Context, userID networkid.UserID) bool {
	return string(userID) == c.meta.UserID
}

func (c *ZaloClient) GetChatInfo(ctx context.Context, portal *bridgev2.Portal) (*bridgev2.ChatInfo, error) {
	threadID, threadType := ParsePortalKey(portal.PortalKey)

	if threadType == ThreadTypeGroup {
		group, err := c.sidecar.GetGroupInfo(ctx, threadID)
		if err != nil {
			return nil, err
		}
		memberMap := make(bridgev2.ChatMemberMap, len(group.Members))
		for _, m := range group.Members {
			name := m.DisplayName
			memberMap[networkid.UserID(m.UserID)] = bridgev2.ChatMember{
				EventSender: bridgev2.EventSender{Sender: networkid.UserID(m.UserID)},
				Membership:  event.MembershipJoin,
				Nickname:    &name,
			}
		}
		roomType := database.RoomTypeDefault
		return &bridgev2.ChatInfo{
			Name: &group.Name,
			Members: &bridgev2.ChatMemberList{
				IsFull:    true,
				MemberMap: memberMap,
			},
			Type: &roomType,
		}, nil
	}

	// DM
	user, err := c.sidecar.GetUserInfo(ctx, threadID)
	if err != nil {
		return nil, err
	}
	roomType := database.RoomTypeDM
	return &bridgev2.ChatInfo{
		Name: &user.DisplayName,
		Members: &bridgev2.ChatMemberList{
			IsFull: true,
			MemberMap: bridgev2.ChatMemberMap{
				networkid.UserID(user.ID): {
					EventSender: bridgev2.EventSender{Sender: networkid.UserID(user.ID)},
					Membership:  event.MembershipJoin,
				},
			},
			OtherUserID: networkid.UserID(user.ID),
		},
		Type: &roomType,
	}, nil
}

func (c *ZaloClient) GetUserInfo(ctx context.Context, ghost *bridgev2.Ghost) (*bridgev2.UserInfo, error) {
	user, err := c.sidecar.GetUserInfo(ctx, string(ghost.ID))
	if err != nil {
		return nil, err
	}
	return &bridgev2.UserInfo{
		Name: &user.DisplayName,
	}, nil
}

func (c *ZaloClient) GetCapabilities(_ context.Context, _ *bridgev2.Portal) *event.RoomFeatures {
	return &event.RoomFeatures{}
}

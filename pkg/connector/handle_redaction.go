package connector

import (
	"context"
	"encoding/json"
	"time"

	"github.com/rs/zerolog"
	"maunium.net/go/mautrix/bridgev2"
	"maunium.net/go/mautrix/bridgev2/networkid"
)

// SidecarUndoData is the JSON shape of an undo/recall event from the sidecar WS.
type SidecarUndoData struct {
	MsgID      string `json:"msgId"`
	SenderID   string `json:"senderId"`
	ThreadID   string `json:"threadId"`
	ThreadType int    `json:"threadType"`
	Timestamp  int64  `json:"timestamp"`
}

// ZaloRemoteMessageRemove implements bridgev2.RemoteMessageRemove.
type ZaloRemoteMessageRemove struct {
	data   *SidecarUndoData
	client *ZaloClient
}

var (
	_ bridgev2.RemoteMessageRemove        = (*ZaloRemoteMessageRemove)(nil)
	_ bridgev2.RemoteEventWithTimestamp    = (*ZaloRemoteMessageRemove)(nil)
)

func (u *ZaloRemoteMessageRemove) GetType() bridgev2.RemoteEventType {
	return bridgev2.RemoteEventMessageRemove
}

func (u *ZaloRemoteMessageRemove) GetPortalKey() networkid.PortalKey {
	return MakePortalKey(u.data.ThreadID, u.data.ThreadType)
}

func (u *ZaloRemoteMessageRemove) GetSender() bridgev2.EventSender {
	return bridgev2.EventSender{
		Sender: networkid.UserID(u.data.SenderID),
	}
}

func (u *ZaloRemoteMessageRemove) GetTimestamp() time.Time {
	return time.UnixMilli(u.data.Timestamp)
}

func (u *ZaloRemoteMessageRemove) AddLogContext(c zerolog.Context) zerolog.Context {
	return c.Str("undo_msg_id", u.data.MsgID)
}

func (u *ZaloRemoteMessageRemove) GetTargetMessage() networkid.MessageID {
	return networkid.MessageID(u.data.MsgID)
}

// handleUndoEvent processes an undo/recall event from the sidecar WS.
func (c *ZaloClient) handleUndoEvent(_ context.Context, data json.RawMessage) {
	var undoData SidecarUndoData
	if err := json.Unmarshal(data, &undoData); err != nil {
		c.log.Err(err).Msg("Failed to parse undo event")
		return
	}

	c.log.Debug().
		Str("msgId", undoData.MsgID).
		Str("sender", undoData.SenderID).
		Msg("[DISCOVERY] Undo event")

	evt := &ZaloRemoteMessageRemove{data: &undoData, client: c}
	c.userLogin.QueueRemoteEvent(evt)
}

// HandleMatrixMessageRemove handles Matrix message deletion -> Zalo undo.
func (c *ZaloClient) HandleMatrixMessageRemove(ctx context.Context, msg *bridgev2.MatrixMessageRemove) error {
	threadID, threadType := ParsePortalKey(msg.Portal.PortalKey)
	targetMsgID := string(msg.TargetMessage.ID)
	return c.sidecar.UndoMessage(ctx, targetMsgID, threadID, threadType)
}

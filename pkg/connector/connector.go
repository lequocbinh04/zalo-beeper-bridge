package connector

import (
	"context"

	"go.mau.fi/util/configupgrade"
	"maunium.net/go/mautrix/bridgev2"
	"maunium.net/go/mautrix/bridgev2/database"
	"maunium.net/go/mautrix/bridgev2/networkid"
)

// Compile-time interface checks
var (
	_ bridgev2.NetworkConnector = (*ZaloConnector)(nil)
)

// ZaloConnector implements bridgev2.NetworkConnector for the Zalo network.
type ZaloConnector struct {
	Bridge *bridgev2.Bridge
	Config ZaloConfig
}

func (z *ZaloConnector) Init(bridge *bridgev2.Bridge) {
	z.Bridge = bridge
}

func (z *ZaloConnector) Start(_ context.Context) error {
	return nil
}

func (z *ZaloConnector) GetName() bridgev2.BridgeName {
	return bridgev2.BridgeName{
		DisplayName:      "Zalo",
		NetworkURL:       "https://zalo.me",
		NetworkIcon:      "",
		NetworkID:        "zalo",
		BeeperBridgeType: "github.com/niconiconainu/mautrix-zalo",
		DefaultPort:      29322,
	}
}

func (z *ZaloConnector) GetCapabilities() *bridgev2.NetworkGeneralCapabilities {
	return &bridgev2.NetworkGeneralCapabilities{}
}

func (z *ZaloConnector) GetConfig() (example string, data any, upgrader configupgrade.Upgrader) {
	return configExample, &z.Config, &zaloConfigUpgrader{}
}

func (z *ZaloConnector) GetDBMetaTypes() database.MetaTypes {
	return database.MetaTypes{
		UserLogin: func() any { return &UserLoginMetadata{} },
	}
}

func (z *ZaloConnector) GetLoginFlows() []bridgev2.LoginFlow {
	return []bridgev2.LoginFlow{{
		Name:        "QR Code",
		Description: "Scan QR code with Zalo mobile app",
		ID:          "qr",
	}}
}

func (z *ZaloConnector) CreateLogin(_ context.Context, user *bridgev2.User, flowID string) (bridgev2.LoginProcess, error) {
	if flowID != "qr" {
		return nil, bridgev2.ErrInvalidLoginFlowID
	}
	return &ZaloLogin{
		connector: z,
		user:      user,
	}, nil
}

func (z *ZaloConnector) LoadUserLogin(_ context.Context, login *bridgev2.UserLogin) error {
	meta := login.Metadata.(*UserLoginMetadata)
	sidecar := NewSidecarClient(z.Config.SidecarURL)
	login.Client = &ZaloClient{
		connector: z,
		userLogin: login,
		meta:      meta,
		sidecar:   sidecar,
	}
	return nil
}

func (z *ZaloConnector) GetBridgeInfoVersion() (info, capabilities int) {
	return 1, 1
}

// MakeUserLoginID creates a UserLoginID from Zalo UID.
func MakeUserLoginID(zaloUID string) networkid.UserLoginID {
	return networkid.UserLoginID(zaloUID)
}

package connector

import (
	"go.mau.fi/util/configupgrade"
)

// ZaloConfig holds network-specific bridge configuration.
type ZaloConfig struct {
	SidecarURL string `yaml:"sidecar_url" json:"sidecar_url"`
}

// UserLoginMetadata stores Zalo credentials for session persistence in the bridge DB.
type UserLoginMetadata struct {
	Cookie    string `json:"cookie"`
	IMEI      string `json:"imei"`
	UserAgent string `json:"user_agent"`
	UserID    string `json:"user_id"`
}

const configExample = `
    # URL of the Node.js sidecar process
    sidecar_url: http://localhost:3500
`

type zaloConfigUpgrader struct{}

func (z *zaloConfigUpgrader) DoUpgrade(helper configupgrade.Helper) {
	helper.Copy(configupgrade.Str, "sidecar_url")
}

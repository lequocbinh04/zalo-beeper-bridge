package main

import (
	"github.com/niconiconainu/mautrix-zalo/pkg/connector"
	"maunium.net/go/mautrix/bridgev2/matrix/mxmain"
)

var (
	Tag       = "unknown"
	Commit    = "unknown"
	BuildTime = "unknown"
)

func main() {
	m := mxmain.BridgeMain{
		Name:        "mautrix-zalo",
		Description: "A Matrix-Zalo puppeting bridge",
		URL:         "https://github.com/niconiconainu/mautrix-zalo",
		Version:     "0.1.0",
		Connector:   &connector.ZaloConnector{},
	}
	m.InitVersion(Tag, Commit, BuildTime)
	m.Run()
}

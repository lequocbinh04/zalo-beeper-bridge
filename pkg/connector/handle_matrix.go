package connector

import (
	"context"
	"fmt"

	"maunium.net/go/mautrix/bridgev2"
	"maunium.net/go/mautrix/bridgev2/database"
	"maunium.net/go/mautrix/bridgev2/networkid"
	"maunium.net/go/mautrix/event"
)

// HandleMatrixMessage routes Matrix messages to Zalo by type.
func (c *ZaloClient) HandleMatrixMessage(ctx context.Context, msg *bridgev2.MatrixMessage) (*bridgev2.MatrixMessageResponse, error) {
	threadID, threadType := ParsePortalKey(msg.Portal.PortalKey)

	switch msg.Content.MsgType {
	case event.MsgText, event.MsgNotice, event.MsgEmote:
		return c.handleMatrixText(ctx, msg, threadID, threadType)
	case event.MsgImage:
		return c.handleMatrixImage(ctx, msg, threadID, threadType)
	default:
		return nil, fmt.Errorf("unsupported message type: %s", msg.Content.MsgType)
	}
}

func (c *ZaloClient) handleMatrixText(ctx context.Context, msg *bridgev2.MatrixMessage, threadID string, threadType int) (*bridgev2.MatrixMessageResponse, error) {
	var quote *string
	// TODO: handle reply/quote lookup when message DB queries are available

	resp, err := c.sidecar.SendText(ctx, msg.Content.Body, threadID, threadType, quote)
	if err != nil {
		return nil, err
	}

	return &bridgev2.MatrixMessageResponse{
		DB: &database.Message{
			ID: networkid.MessageID(resp.MessageID),
		},
	}, nil
}

func (c *ZaloClient) handleMatrixImage(ctx context.Context, msg *bridgev2.MatrixMessage, threadID string, threadType int) (*bridgev2.MatrixMessageResponse, error) {
	// Download from Matrix mxc:// URI using the bot intent
	data, err := downloadFromMatrix(ctx, msg.Portal.Bridge.Bot, msg.Content.URL)
	if err != nil {
		return nil, fmt.Errorf("download from matrix: %w", err)
	}

	// Save to temp file for sidecar
	tmpFile, err := saveTempFile(data)
	if err != nil {
		return nil, fmt.Errorf("save temp file: %w", err)
	}
	defer cleanupTempFile(tmpFile)

	resp, err := c.sidecar.SendImage(ctx, tmpFile, threadID, threadType)
	if err != nil {
		return nil, err
	}

	return &bridgev2.MatrixMessageResponse{
		DB: &database.Message{
			ID: networkid.MessageID(resp.MessageID),
		},
	}, nil
}

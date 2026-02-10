package connector

import (
	"context"
	"encoding/json"
	"time"

	"github.com/rs/zerolog"
	"maunium.net/go/mautrix/bridgev2"
	"maunium.net/go/mautrix/bridgev2/database"
	"maunium.net/go/mautrix/bridgev2/networkid"
)

// SidecarReactionData is the JSON shape of a reaction event from the sidecar WS.
type SidecarReactionData struct {
	Emoji       string `json:"emoji"`
	TargetMsgID string `json:"targetMsgId"`
	SenderID    string `json:"senderId"`
	ThreadID    string `json:"threadId"`
	ThreadType  int    `json:"threadType"`
	Action      string `json:"action"` // "add" or "remove"
	Timestamp   int64  `json:"timestamp"`
}

// ZaloRemoteReaction implements bridgev2.RemoteReaction.
type ZaloRemoteReaction struct {
	data   *SidecarReactionData
	client *ZaloClient
}

var (
	_ bridgev2.RemoteReaction             = (*ZaloRemoteReaction)(nil)
	_ bridgev2.RemoteEventWithTimestamp   = (*ZaloRemoteReaction)(nil)
)

func (r *ZaloRemoteReaction) GetType() bridgev2.RemoteEventType {
	if r.data.Action == "remove" {
		return bridgev2.RemoteEventReactionRemove
	}
	return bridgev2.RemoteEventReaction
}

func (r *ZaloRemoteReaction) GetPortalKey() networkid.PortalKey {
	return MakePortalKey(r.data.ThreadID, r.data.ThreadType)
}

func (r *ZaloRemoteReaction) GetSender() bridgev2.EventSender {
	return bridgev2.EventSender{
		Sender: networkid.UserID(r.data.SenderID),
	}
}

func (r *ZaloRemoteReaction) GetTimestamp() time.Time {
	return time.UnixMilli(r.data.Timestamp)
}

func (r *ZaloRemoteReaction) AddLogContext(c zerolog.Context) zerolog.Context {
	return c.Str("reaction_emoji", r.data.Emoji).Str("target_msg", r.data.TargetMsgID)
}

func (r *ZaloRemoteReaction) GetTargetMessage() networkid.MessageID {
	return networkid.MessageID(r.data.TargetMsgID)
}

func (r *ZaloRemoteReaction) GetReactionEmoji() (string, networkid.EmojiID) {
	return r.data.Emoji, ""
}

// handleReactionEvent processes a reaction event from the sidecar WS.
func (c *ZaloClient) handleReactionEvent(_ context.Context, data json.RawMessage) {
	var reactionData SidecarReactionData
	if err := json.Unmarshal(data, &reactionData); err != nil {
		c.log.Err(err).Msg("Failed to parse reaction event")
		return
	}

	c.log.Debug().
		Str("emoji", reactionData.Emoji).
		Str("target", reactionData.TargetMsgID).
		Str("action", reactionData.Action).
		Msg("[DISCOVERY] Reaction event")

	evt := &ZaloRemoteReaction{data: &reactionData, client: c}
	c.userLogin.QueueRemoteEvent(evt)
}

// PreHandleMatrixReaction validates and prepares reaction data.
func (c *ZaloClient) PreHandleMatrixReaction(_ context.Context, msg *bridgev2.MatrixReaction) (bridgev2.MatrixReactionPreResponse, error) {
	return bridgev2.MatrixReactionPreResponse{
		SenderID: networkid.UserID(c.meta.UserID),
		Emoji:    msg.Content.RelatesTo.Key,
	}, nil
}

// HandleMatrixReaction sends a reaction to Zalo via the sidecar.
func (c *ZaloClient) HandleMatrixReaction(ctx context.Context, msg *bridgev2.MatrixReaction) (*database.Reaction, error) {
	threadID, threadType := ParsePortalKey(msg.Portal.PortalKey)
	targetMsgID := string(msg.TargetMessage.ID)

	err := c.sidecar.SendReaction(ctx, targetMsgID, msg.PreHandleResp.Emoji, threadID, threadType)
	if err != nil {
		return nil, err
	}

	return &database.Reaction{}, nil
}

// HandleMatrixReactionRemove removes a reaction from Zalo.
func (c *ZaloClient) HandleMatrixReactionRemove(ctx context.Context, msg *bridgev2.MatrixReactionRemove) error {
	threadID, threadType := ParsePortalKey(msg.Portal.PortalKey)
	targetMsgID := string(msg.TargetReaction.MessageID)
	return c.sidecar.SendReaction(ctx, targetMsgID, "", threadID, threadType)
}

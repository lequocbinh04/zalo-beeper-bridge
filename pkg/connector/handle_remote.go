package connector

import (
	"context"
	"encoding/json"
	"time"

	"github.com/rs/zerolog"
	"maunium.net/go/mautrix/bridgev2"
	"maunium.net/go/mautrix/bridgev2/networkid"
	"maunium.net/go/mautrix/event"
)

// SidecarMessageData is the JSON shape of a message event from the sidecar WS.
type SidecarMessageData struct {
	MsgID      string          `json:"msgId"`
	Content    string          `json:"content"`
	ThreadID   string          `json:"threadId"`
	ThreadType int             `json:"threadType"`
	SenderID   string          `json:"senderId"`
	IsSelf     bool            `json:"isSelf"`
	Timestamp  int64           `json:"timestamp"`
	Quote      json.RawMessage `json:"quote"`
	MsgType    string          `json:"msgType"`
	MediaURL   string          `json:"mediaUrl"`
	Thumb      string          `json:"thumb"`
	Width      int             `json:"width"`
	Height     int             `json:"height"`
}

// ZaloRemoteMessage implements bridgev2.RemoteMessage and RemoteEventThatMayCreatePortal.
type ZaloRemoteMessage struct {
	data   *SidecarMessageData
	client *ZaloClient
}

var (
	_ bridgev2.RemoteMessage                  = (*ZaloRemoteMessage)(nil)
	_ bridgev2.RemoteEventThatMayCreatePortal = (*ZaloRemoteMessage)(nil)
	_ bridgev2.RemoteEventWithTimestamp       = (*ZaloRemoteMessage)(nil)
)

func (m *ZaloRemoteMessage) GetType() bridgev2.RemoteEventType {
	return bridgev2.RemoteEventMessage
}

func (m *ZaloRemoteMessage) GetPortalKey() networkid.PortalKey {
	return MakePortalKey(m.data.ThreadID, m.data.ThreadType)
}

func (m *ZaloRemoteMessage) GetSender() bridgev2.EventSender {
	return bridgev2.EventSender{
		Sender:   networkid.UserID(m.data.SenderID),
		IsFromMe: m.data.IsSelf,
	}
}

func (m *ZaloRemoteMessage) GetID() networkid.MessageID {
	return networkid.MessageID(m.data.MsgID)
}

func (m *ZaloRemoteMessage) GetTimestamp() time.Time {
	return time.UnixMilli(m.data.Timestamp)
}

func (m *ZaloRemoteMessage) AddLogContext(c zerolog.Context) zerolog.Context {
	return c.Str("zalo_msg_id", m.data.MsgID).Str("thread_id", m.data.ThreadID)
}

func (m *ZaloRemoteMessage) ShouldCreatePortal() bool {
	return true
}

// ConvertMessage converts a Zalo message to a Matrix ConvertedMessage.
func (m *ZaloRemoteMessage) ConvertMessage(ctx context.Context, portal *bridgev2.Portal, intent bridgev2.MatrixAPI) (*bridgev2.ConvertedMessage, error) {
	switch m.data.MsgType {
	case "image", "gif":
		return m.convertImageMessage(ctx, portal, intent)
	case "sticker":
		return m.convertStickerMessage(ctx, portal, intent)
	default:
		return m.convertTextMessage(ctx, portal)
	}
}

func (m *ZaloRemoteMessage) convertTextMessage(_ context.Context, _ *bridgev2.Portal) (*bridgev2.ConvertedMessage, error) {
	content := &event.MessageEventContent{
		MsgType: event.MsgText,
		Body:    m.data.Content,
	}

	return &bridgev2.ConvertedMessage{
		Parts: []*bridgev2.ConvertedMessagePart{{
			Type:    event.EventMessage,
			Content: content,
		}},
	}, nil
}

func (m *ZaloRemoteMessage) convertImageMessage(ctx context.Context, _ *bridgev2.Portal, intent bridgev2.MatrixAPI) (*bridgev2.ConvertedMessage, error) {
	if m.data.MediaURL == "" {
		// Fallback to text if no media URL
		return m.convertTextMessage(ctx, nil)
	}

	imgData, err := downloadFromURL(ctx, m.data.MediaURL)
	if err != nil {
		return nil, err
	}

	mxcURI, err := uploadToMatrix(ctx, intent, imgData, "image", detectMIME(imgData))
	if err != nil {
		return nil, err
	}

	content := &event.MessageEventContent{
		MsgType: event.MsgImage,
		Body:    "image",
		URL:     mxcURI,
		Info: &event.FileInfo{
			MimeType: detectMIME(imgData),
			Width:    m.data.Width,
			Height:   m.data.Height,
			Size:     len(imgData),
		},
	}

	return &bridgev2.ConvertedMessage{
		Parts: []*bridgev2.ConvertedMessagePart{{
			Type:    event.EventMessage,
			Content: content,
		}},
	}, nil
}

func (m *ZaloRemoteMessage) convertStickerMessage(ctx context.Context, _ *bridgev2.Portal, intent bridgev2.MatrixAPI) (*bridgev2.ConvertedMessage, error) {
	if m.data.MediaURL == "" {
		return m.convertTextMessage(ctx, nil)
	}

	stickerData, err := downloadFromURL(ctx, m.data.MediaURL)
	if err != nil {
		return nil, err
	}

	mxcURI, err := uploadToMatrix(ctx, intent, stickerData, "sticker.png", "image/png")
	if err != nil {
		return nil, err
	}

	content := &event.MessageEventContent{
		MsgType: event.MsgImage,
		Body:    "sticker",
		URL:     mxcURI,
	}

	return &bridgev2.ConvertedMessage{
		Parts: []*bridgev2.ConvertedMessagePart{{
			Type:    event.EventSticker,
			Content: content,
		}},
	}, nil
}

// handleMessageEvent processes an incoming message from sidecar WS.
func (c *ZaloClient) handleMessageEvent(_ context.Context, data json.RawMessage) {
	var msgData SidecarMessageData
	if err := json.Unmarshal(data, &msgData); err != nil {
		c.log.Err(err).Msg("Failed to parse message event")
		return
	}

	// Skip self-sent messages to avoid echo
	if msgData.IsSelf {
		return
	}

	evt := &ZaloRemoteMessage{
		data:   &msgData,
		client: c,
	}

	c.userLogin.QueueRemoteEvent(evt)
}

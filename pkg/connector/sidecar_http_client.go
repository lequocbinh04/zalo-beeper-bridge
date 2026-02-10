package connector

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// SidecarClient wraps HTTP calls to the Node.js sidecar process.
type SidecarClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewSidecarClient creates a new sidecar HTTP client.
func NewSidecarClient(baseURL string) *SidecarClient {
	return &SidecarClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// doJSON performs a JSON request and decodes the response.
func (s *SidecarClient) doJSON(ctx context.Context, method, path string, body any, result any) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, s.baseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		var errResp SidecarErrorResponse
		if json.Unmarshal(respBody, &errResp) == nil && errResp.Error != "" {
			return fmt.Errorf("sidecar error (%s): %s", errResp.Code, errResp.Error)
		}
		return fmt.Errorf("sidecar HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	if result != nil {
		if err := json.Unmarshal(respBody, result); err != nil {
			return fmt.Errorf("unmarshal response: %w", err)
		}
	}
	return nil
}

// LoginCookie restores a Zalo session via stored credentials.
func (s *SidecarClient) LoginCookie(ctx context.Context, cookie, imei, userAgent string) (*SidecarLoginResponse, error) {
	var resp SidecarLoginResponse
	err := s.doJSON(ctx, http.MethodPost, "/login/cookie", map[string]string{
		"cookie":    cookie,
		"imei":      imei,
		"userAgent": userAgent,
	}, &resp)
	return &resp, err
}

// SendText sends a text message via the sidecar.
func (s *SidecarClient) SendText(ctx context.Context, msg, threadID string, threadType int, quote *string) (*SidecarSendResponse, error) {
	body := map[string]any{
		"msg":        msg,
		"threadId":   threadID,
		"threadType": threadType,
	}
	if quote != nil {
		body["quote"] = *quote
	}
	var resp SidecarSendResponse
	err := s.doJSON(ctx, http.MethodPost, "/send/text", body, &resp)
	return &resp, err
}

// SendImage sends an image message via the sidecar.
func (s *SidecarClient) SendImage(ctx context.Context, filePath, threadID string, threadType int) (*SidecarSendResponse, error) {
	var resp SidecarSendResponse
	err := s.doJSON(ctx, http.MethodPost, "/send/image", map[string]any{
		"filePath":   filePath,
		"threadId":   threadID,
		"threadType": threadType,
	}, &resp)
	return &resp, err
}

// SendSticker sends a sticker via the sidecar.
func (s *SidecarClient) SendSticker(ctx context.Context, stickerID, threadID string, threadType int) (*SidecarSendResponse, error) {
	var resp SidecarSendResponse
	err := s.doJSON(ctx, http.MethodPost, "/send/sticker", map[string]any{
		"stickerId":  stickerID,
		"threadId":   threadID,
		"threadType": threadType,
	}, &resp)
	return &resp, err
}

// SendReaction sends a reaction to a message via the sidecar.
func (s *SidecarClient) SendReaction(ctx context.Context, msgID, emoji, threadID string, threadType int) error {
	return s.doJSON(ctx, http.MethodPost, "/send/reaction", map[string]any{
		"messageId":  msgID,
		"emoji":      emoji,
		"threadId":   threadID,
		"threadType": threadType,
	}, nil)
}

// UndoMessage recalls/undoes a message via the sidecar.
func (s *SidecarClient) UndoMessage(ctx context.Context, msgID, threadID string, threadType int) error {
	return s.doJSON(ctx, http.MethodPost, "/send/undo", map[string]any{
		"messageId":  msgID,
		"threadId":   threadID,
		"threadType": threadType,
	}, nil)
}

// GetUserInfo fetches user profile from the sidecar.
func (s *SidecarClient) GetUserInfo(ctx context.Context, userID string) (*SidecarUserInfoResponse, error) {
	var wrapper struct {
		User SidecarUserInfoResponse `json:"user"`
	}
	err := s.doJSON(ctx, http.MethodGet, "/user/"+userID, nil, &wrapper)
	return &wrapper.User, err
}

// GetGroupInfo fetches group info from the sidecar.
func (s *SidecarClient) GetGroupInfo(ctx context.Context, groupID string) (*SidecarGroupInfoResponse, error) {
	var wrapper struct {
		Group SidecarGroupInfoResponse `json:"group"`
	}
	err := s.doJSON(ctx, http.MethodGet, "/group/"+groupID, nil, &wrapper)
	return &wrapper.Group, err
}

// GetSelfID returns the logged-in user's own Zalo ID.
func (s *SidecarClient) GetSelfID(ctx context.Context) (string, error) {
	var resp struct {
		OwnID string `json:"ownId"`
	}
	err := s.doJSON(ctx, http.MethodGet, "/self", nil, &resp)
	return resp.OwnID, err
}

// Logout disconnects the sidecar session.
func (s *SidecarClient) Logout(ctx context.Context) error {
	return s.doJSON(ctx, http.MethodPost, "/logout", nil, nil)
}

// Health checks sidecar availability.
func (s *SidecarClient) Health(ctx context.Context) error {
	return s.doJSON(ctx, http.MethodGet, "/health", nil, nil)
}

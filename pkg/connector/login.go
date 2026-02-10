package connector

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"maunium.net/go/mautrix/bridgev2"
	"maunium.net/go/mautrix/bridgev2/database"
	"maunium.net/go/mautrix/bridgev2/networkid"
)

// ZaloLogin implements bridgev2.LoginProcessDisplayAndWait for QR code login.
type ZaloLogin struct {
	connector *ZaloConnector
	user      *bridgev2.User
}

var _ bridgev2.LoginProcessDisplayAndWait = (*ZaloLogin)(nil)

func (l *ZaloLogin) Start(ctx context.Context) (*bridgev2.LoginStep, error) {
	sidecarURL := l.connector.Config.SidecarURL
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sidecarURL+"/login/qr", nil)
	if err != nil {
		return nil, fmt.Errorf("create QR request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call sidecar /login/qr: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read QR response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sidecar QR login failed (status %d): %s", resp.StatusCode, string(body))
	}

	var qrResp struct {
		QRData string `json:"qrData"`
	}
	if err := json.Unmarshal(body, &qrResp); err != nil {
		return nil, fmt.Errorf("parse QR response: %w", err)
	}

	return &bridgev2.LoginStep{
		Type:         bridgev2.LoginStepTypeDisplayAndWait,
		StepID:       "fi.mau.zalo.login.qr",
		Instructions: "Scan the QR code with your Zalo mobile app",
		DisplayAndWaitParams: &bridgev2.LoginDisplayAndWaitParams{
			Type: bridgev2.LoginDisplayTypeQR,
			Data: qrResp.QRData,
		},
	}, nil
}

func (l *ZaloLogin) Wait(ctx context.Context) (*bridgev2.LoginStep, error) {
	sidecarURL := l.connector.Config.SidecarURL
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sidecarURL+"/login/wait", nil)
	if err != nil {
		return nil, fmt.Errorf("create wait request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call sidecar /login/wait: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read wait response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("login wait failed (status %d): %s", resp.StatusCode, string(body))
	}

	var loginResp SidecarLoginResponse
	if err := json.Unmarshal(body, &loginResp); err != nil {
		return nil, fmt.Errorf("parse login response: %w", err)
	}

	return l.finishLogin(ctx, &loginResp)
}

func (l *ZaloLogin) finishLogin(ctx context.Context, session *SidecarLoginResponse) (*bridgev2.LoginStep, error) {
	meta := &UserLoginMetadata{
		Cookie:    session.Cookie,
		IMEI:      session.IMEI,
		UserAgent: session.UserAgent,
		UserID:    session.UserID,
	}

	loginID := MakeUserLoginID(session.UserID)
	ul, err := l.user.NewLogin(ctx, &database.UserLogin{
		ID:       loginID,
		Metadata: meta,
	}, &bridgev2.NewLoginParams{})
	if err != nil {
		return nil, fmt.Errorf("save user login: %w", err)
	}

	sidecar := NewSidecarClient(l.connector.Config.SidecarURL)
	ul.Client = &ZaloClient{
		connector: l.connector,
		userLogin: ul,
		meta:      meta,
		sidecar:   sidecar,
	}

	return &bridgev2.LoginStep{
		Type:         bridgev2.LoginStepTypeComplete,
		StepID:       "fi.mau.zalo.login.complete",
		Instructions: "Successfully logged in to Zalo",
		CompleteParams: &bridgev2.LoginCompleteParams{
			UserLoginID: loginID,
			UserLogin:   ul,
		},
	}, nil
}

func (l *ZaloLogin) Cancel() {
	sidecarURL := l.connector.Config.SidecarURL
	_, _ = http.Post(sidecarURL+"/logout", "application/json", nil)
}

// MakeUserLoginIDFromMeta creates a UserLoginID from metadata.
func MakeUserLoginIDFromMeta(meta *UserLoginMetadata) networkid.UserLoginID {
	return networkid.UserLoginID(meta.UserID)
}

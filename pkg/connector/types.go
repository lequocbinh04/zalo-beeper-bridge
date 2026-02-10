package connector

import (
	"fmt"
	"strconv"
	"strings"

	"maunium.net/go/mautrix/bridgev2/networkid"
)

// Thread type constants matching zca-js ThreadType enum.
const (
	ThreadTypeUser  = 0
	ThreadTypeGroup = 1
)

// MakePortalKey creates a PortalKey from Zalo thread ID and type.
// Format: "threadId:threadType"
func MakePortalKey(threadID string, threadType int) networkid.PortalKey {
	return networkid.PortalKey{
		ID:       networkid.PortalID(fmt.Sprintf("%s:%d", threadID, threadType)),
		Receiver: "",
	}
}

// ParsePortalKey extracts thread ID and type from a PortalKey.
func ParsePortalKey(key networkid.PortalKey) (threadID string, threadType int) {
	parts := strings.SplitN(string(key.ID), ":", 2)
	if len(parts) != 2 {
		return string(key.ID), ThreadTypeUser
	}
	t, err := strconv.Atoi(parts[1])
	if err != nil {
		return parts[0], ThreadTypeUser
	}
	return parts[0], t
}

// MakeUserID creates a networkid.UserID from a Zalo user ID string.
func MakeUserID(zaloUID string) networkid.UserID {
	return networkid.UserID(zaloUID)
}

// Sidecar response types

type SidecarLoginResponse struct {
	UserID    string `json:"userId"`
	Cookie    string `json:"cookie"`
	IMEI      string `json:"imei"`
	UserAgent string `json:"userAgent"`
}

type SidecarSendResponse struct {
	MessageID string `json:"messageId"`
}

type SidecarUserInfoResponse struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl"`
}

type SidecarGroupInfoResponse struct {
	ID      string               `json:"id"`
	Name    string               `json:"name"`
	Avatar  string               `json:"avatarUrl"`
	Members []SidecarGroupMember `json:"members"`
}

type SidecarGroupMember struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
}

type SidecarHealthResponse struct {
	Status string `json:"status"`
}

type SidecarErrorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

package connector

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"

	"maunium.net/go/mautrix/bridgev2"
	"maunium.net/go/mautrix/id"
)

// downloadFromURL downloads a file from a URL to bytes.
func downloadFromURL(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create download request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read download body: %w", err)
	}
	return data, nil
}

// uploadToMatrix uploads data to the Matrix media repo.
func uploadToMatrix(ctx context.Context, intent bridgev2.MatrixAPI, data []byte, filename, mimetype string) (id.ContentURIString, error) {
	uri, _, err := intent.UploadMedia(ctx, "", data, filename, mimetype)
	if err != nil {
		return "", fmt.Errorf("upload to matrix: %w", err)
	}
	return uri, nil
}

// downloadFromMatrix downloads media from a Matrix mxc:// URI via the intent.
func downloadFromMatrix(ctx context.Context, intent bridgev2.MatrixAPI, mxcURI id.ContentURIString) ([]byte, error) {
	data, err := intent.DownloadMedia(ctx, mxcURI, nil)
	if err != nil {
		return nil, fmt.Errorf("download from matrix: %w", err)
	}
	return data, nil
}

// saveTempFile writes data to a temporary file and returns the path.
func saveTempFile(data []byte) (string, error) {
	tmp, err := os.CreateTemp("", "mautrix-zalo-*")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return "", fmt.Errorf("write temp file: %w", err)
	}
	tmp.Close()
	return tmp.Name(), nil
}

// cleanupTempFile removes a temporary file.
func cleanupTempFile(path string) {
	if path != "" {
		os.Remove(path)
	}
}

// detectMIME detects the MIME type from file data.
func detectMIME(data []byte) string {
	return http.DetectContentType(data)
}

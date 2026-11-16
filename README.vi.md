# zalo-beeper-bridge

[English](README.md) | **Tiếng Việt**

[![CI](https://github.com/lethucthanhtu/zalo-beeper-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lethucthanhtu/zalo-beeper-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Một [Matrix](https://matrix.org/) application service tự host, dùng để kết nối (bridge) tài khoản **Zalo** cá nhân vào **[Beeper](https://www.beeper.com/)**. Dự án viết bằng Node.js và TypeScript, dựa trên [zca-js](https://github.com/RFS-ADRENO/zca-js) (API Zalo Web không chính thức) và [matrix-appservice-bridge](https://github.com/matrix-org/matrix-appservice-bridge). Bridge kết nối với Beeper qua [bbctl](https://github.com/beeper/bridge-manager).

Kèm theo là một **công cụ nhập lịch sử** (history importer): chuyển toàn bộ lịch sử Zalo từ Zalo PC (và file sao lưu mã hoá `.zl.zip` của nó) vào Beeper, giữ nguyên thời gian gốc, media thật, trả lời (reply) và nhắc tên (mention).

> [!WARNING]
> **Không chính thức, tự chịu rủi ro.** zca-js giao tiếp với Zalo Web bằng cách dịch ngược (reverse engineering). Việc này vi phạm điều khoản sử dụng của Zalo và **có thể khiến tài khoản bị khoá hoặc cấm**. Zalo không có API chính thức cho tin nhắn cá nhân. Nếu không muốn đánh cược tài khoản chính, hãy dùng tài khoản phụ. Đây là công cụ cá nhân làm vì đam mê, không phải sản phẩm có hỗ trợ.

## Tài liệu

Tài liệu đầy đủ (tiếng Anh) nằm trong [`docs/`](docs/index.md):

| Chủ đề                                                                                                                   | Nội dung                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [Getting started](docs/guide/getting-started.md)                                                                         | Cài `bbctl`, đăng ký, cấu hình, chạy và đăng nhập Zalo          |
| [Features](docs/guide/features.md)                                                                                       | Những gì được bridge theo từng chiều, và những gì không         |
| [Configuration](docs/guide/configuration.md)                                                                             | Mọi tuỳ chọn trong `config.yaml`                                |
| [Bot commands](docs/guide/bot-commands.md)                                                                               | `login`, `status`, `sync`, `accounts` và các lệnh khác          |
| [Container deployment](docs/deployment/container.md)                                                                     | Docker hoặc Podman, cách khuyên dùng để chạy 24/7               |
| [macOS (launchd)](docs/deployment/macos-launchd.md)                                                                      | Chạy dưới dạng launchd agent                                    |
| [Operations](docs/deployment/operations.md)                                                                              | Kiểm tra sức khoẻ, log, nâng cấp, sao lưu và rollback           |
| [History import](docs/history-import/index.md)                                                                           | Đưa lịch sử Zalo cũ vào Beeper                                  |
| [Multiple accounts](docs/guide/multiple-accounts.md)                                                                     | Chạy tài khoản Zalo thứ hai bằng một bridge thứ hai             |
| [Troubleshooting](docs/troubleshooting.md) · [FAQ](docs/faq.md)                                                          | Lỗi thường gặp và câu hỏi hay gặp                               |
| [Security & privacy](docs/security.md)                                                                                   | Rủi ro tài khoản, bí mật lưu trên đĩa, dữ liệu nào rời khỏi máy |
| [Architecture](docs/reference/architecture.md) · [Database](docs/reference/database.md) · [Logs](docs/reference/logs.md) | Cách bridge được xây dựng                                       |
| [Development](docs/contributing/development.md)                                                                          | Làm việc với mã nguồn                                           |

Tài liệu là một trang [VitePress](https://vitepress.dev/): chạy `npm run docs:dev` để xem trên máy.

## Tính năng

| Hạng mục                            |                    Zalo → Beeper                    |                 Beeper → Zalo                 |
| ----------------------------------- | :-------------------------------------------------: | :-------------------------------------------: |
| Văn bản (chat riêng + nhóm)         |                ✅ (kể cả rich text)                 |                      ✅                       |
| @nhắc tên                           |                   ✅ (dạng pill)                    |                      ✅                       |
| Trả lời / trích dẫn                 |                         ✅                          |                      ✅                       |
| Ảnh                                 |                         ✅                          |                      ✅                       |
| Sticker                             | ✅ động (`m.sticker`, WebP dựng từ sprite của Zalo) |                       —                       |
| GIF                                 |                         ✅                          |                       —                       |
| Video                               |                   ✅ (`m.video`)                    |                      ✅                       |
| File                                |                    ✅ (`m.file`)                    |                      ✅                       |
| Tin nhắn thoại                      |           ✅ (`m.audio` dạng voice note)            | ✅ voice note (ogg/opus được chuyển sang AAC) |
| Thẻ liên kết                        |          ✅ văn bản + link preview Beeper           |      ✅ Zalo tự tạo thẻ liên kết của nó       |
| Vị trí                              |  ✅ `m.location` (xem trước bản đồ, mở app bản đồ)  |                       —                       |
| Danh thiếp                          |   ✅ mã QR + tên, số điện thoại và link `zalo.me`   |                       —                       |
| Thẻ web (`chat.webcontent`)         |            ✅ văn bản (tiêu đề + mô tả)             |                       —                       |
| Biểu cảm (reaction)                 |                         ✅                          |                      ✅                       |
| Thu hồi tin nhắn                    |                          —                          |                      ✅                       |
| "Xoá ở phía tôi" trên thiết bị khác |             ✅ cũng bị xoá trong Beeper             |                       —                       |
| Đã xem (read receipt)               |                         ✅                          |   ✅ (theo cài đặt read receipt của Beeper)   |
| Đang soạn tin (typing)              |                         ✅                          |      ✅ (theo cài đặt typing của Beeper)      |
| Tin bạn gửi từ điện thoại           |                ✅ (double-puppeting)                |                      n/a                      |
| Chat Zalo mã hoá đầu cuối           |       chỉ hiện thông báo (không giải mã được)       |                       —                       |

Ngoài ra bridge còn:

- Tạo một ghost user cho mỗi liên hệ Zalo, với tên và ảnh đại diện thật.
- Tự tạo phòng cho mỗi cuộc trò chuyện khi có tin nhắn đầu tiên.
- Có lệnh `sync` để tạo phòng cho các chat được ghim và mọi nhóm.
- Tự lấy lại các tin nhắn bị lỡ sau mỗi lần kết nối lại.
- Hiển thị mạng trong Beeper là "Zalo", kèm logo.
- Giới hạn tốc độ gửi tin đi.
- Lưu phiên đăng nhập Zalo ở dạng mã hoá.

**Chưa hỗ trợ:** đồng bộ thu hồi và chỉnh sửa từ Zalo sang Beeper, bridge các chat mã hoá đầu cuối, và tải lịch sử trực tiếp từ máy chủ Zalo (Zalo Web không trả về gì từ trước lúc đăng nhập, nên hãy dùng công cụ nhập lịch sử). Chi tiết xem [Features](docs/guide/features.md).

## Bắt đầu nhanh (container)

Yêu cầu: Docker hoặc Podman, một tài khoản Beeper và [bbctl](https://github.com/beeper/bridge-manager). [Hướng dẫn bắt đầu](docs/guide/getting-started.md) có đầy đủ các bước và cách chạy không dùng container (Node.js 22.18+).

```bash
git clone https://github.com/lethucthanhtu/zalo-beeper-bridge.git
cd zalo-beeper-bridge

bbctl login
bbctl register -o registration.yaml sh-zalo     # sau đó đặt url: http://localhost:29350 trong file này
cp config.yaml.example config.yaml              # điền các giá trị bbctl đã in ra

mkdir container-config && cp config.yaml registration.yaml container-config/
cp ~/.config/bbctl/config.json container-config/bbctl-config.json
podman compose up -d --build                    # hoặc: docker compose up -d --build
```

Trong Beeper, mở chat với `@sh-zalobot:beeper.local`, gửi `login` và quét mã QR bằng app Zalo trên điện thoại. Sau đó gửi `sync` để tạo phòng cho các chat được ghim và các nhóm.

> [!IMPORTANT]
> Zalo chỉ cho phép một phiên web. Đừng mở Zalo Web trên trình duyệt khi bridge đang chạy, nếu không hai bên sẽ liên tục đá nhau ra. App điện thoại và Zalo PC thì dùng bình thường.

## Nhập lịch sử Zalo

Zalo Web không trả cho bridge bất kỳ tin nào từ trước lúc đăng nhập. Vì vậy công cụ nhập lịch sử đọc lịch sử từ Zalo PC, và có thể lấy thêm media từ file sao lưu của Zalo PC. Sau đó nó dựng lại từng cuộc trò chuyện trong Beeper với thời gian gốc, kiểm tra kết quả rồi mới xoá phòng cũ. Khi container bridge đang chạy:

```powershell
# Windows (PowerShell 7 + Git for Windows)
pwsh scripts/zalo-pc/import.ps1
```

```bash
# macOS (Zalo PC cài trong /Applications)
scripts/zalo-pc/import.sh
```

Xem [History import](docs/history-import/index.md) để biết những gì được nhập, các bước làm thủ công và CLI của công cụ.

## Phát triển

```bash
npm ci
npm run typecheck && npm run lint && npm test
```

Xem [Development](docs/contributing/development.md) và [CONTRIBUTING.md](CONTRIBUTING.md).

## Đóng góp

Mọi đóng góp đều được hoan nghênh. Vui lòng đọc [CONTRIBUTING.md](CONTRIBUTING.md) (cách cài đặt, quy ước và quy tắc riêng tư cho fixture và log) và [quy tắc ứng xử](CODE_OF_CONDUCT.md). Báo lỗi bảo mật một cách riêng tư theo hướng dẫn trong [SECURITY.md](SECURITY.md). Các thay đổi được ghi trong [CHANGELOG.md](CHANGELOG.md).

## Ghi nhận

- [lequocbinh04/zalo-beeper-bridge](https://github.com/lequocbinh04/zalo-beeper-bridge): dự án gốc mà repo này fork từ đó
- [zca-js](https://github.com/RFS-ADRENO/zca-js): API Zalo Web không chính thức mà bridge dựa vào
- [matrix-appservice-bridge](https://github.com/matrix-org/matrix-appservice-bridge)
- [Beeper Bridge Manager](https://github.com/beeper/bridge-manager)
- [jSquash](https://github.com/jamsinclair/jSquash) (codec JPEG XL / JPEG) và [wasm-webp](https://github.com/nieyuyao/webp-wasm) (WebP động)
- Tham khảo các pattern từ họ bridge [mautrix](https://github.com/mautrix)

## Giấy phép

MIT, xem [LICENSE](./LICENSE). Không liên kết với Zalo/VNG hay Beeper.

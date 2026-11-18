# VIN-HOADON: tiện ích điền mã tra cứu trên trang `tracuuhd`

Tiện ích này chỉ cần nếu muốn tiếp tục tra cứu thủ công ngay trên trang của
nhà cung cấp. Để tải PDF trong HoangMySoft, dùng nút **Tải PDF gốc
VIN-HOADON**; ứng dụng lấy mã số bí mật từ XML, yêu cầu người dùng nhập CAPTCHA
hiển thị, rồi tải và xác minh PDF gốc. Không cần cài tiện ích cho luồng đó.

Tiện ích Chrome/Edge **cần cài một lần** nếu muốn HoangMySoft tự điền mã từ XML vào trang của nhà cung cấp. Trình duyệt không cho website HoangMySoft tự chỉnh form của một website khác.

1. Tải thư mục `browser-extension/visnam-prefill` (gồm `manifest.json` và `visnam-prefill.js`).
2. Mở `chrome://extensions` hoặc `edge://extensions`, bật Developer mode, chọn Load unpacked và chọn thư mục.
3. Nếu cần tra cứu thủ công, bấm **Mở cổng VIN-HOADON**. URL mở trang tra cứu với mã từ `QuanLy_SoBaoMat` trong fragment `#hms_visnam_code=...`.
4. Tiện ích chỉ điền ô mã tra cứu có thể xác định an toàn, không điền CAPTCHA. Nếu giao diện đổi hoặc không rõ ô mã, tiện ích không tự điền.

Tiện ích chỉ điền ô mã tra cứu; không giải CAPTCHA, không bấm Tra cứu, không gửi thông tin sang máy chủ HoangMySoft và không tải PDF. Luồng tải PDF trong ứng dụng sẽ gửi mã CAPTCHA do người dùng nhập và tải kết quả đã được máy chủ đối chiếu với XML hóa đơn.

# Tiện ích điền mã tra cứu VIN-HOADON và Saigon Co.op

Tiện ích Chrome/Edge này chỉ điền mã tra cứu vào đúng ô trên cổng nhà cung cấp.
Nó không điền CAPTCHA, không gửi biểu mẫu và không tải hóa đơn.

Ứng dụng web không thể tự sửa biểu mẫu của website khác. Cài tiện ích một lần:

1. Tải thư mục `browser-extension/visnam-prefill` (gồm `manifest.json` và `visnam-prefill.js`).
2. Mở `chrome://extensions` hoặc `edge://extensions`, bật Developer mode, chọn Load unpacked và chọn thư mục.
3. Với VIN-HOADON, bấm **Mở cổng VIN-HOADON**. Tiện ích điền mã từ XML vào ô mã tra cứu.
4. Với Saigon Co.op, bấm **Mở cổng Saigon Co.op, nhập CAPTCHA**. Tiện ích điền `Mã nhận HĐ`; nhập CAPTCHA và bấm **Tìm hóa đơn** trên cổng.

Mã tra cứu chỉ được truyền trong fragment của URL, không gửi cùng HTTP request khi mở trang. Tiện ích xóa fragment sau khi điền thành công; CAPTCHA luôn do người dùng nhập.

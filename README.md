# React + Vite

## Tài liệu vận hành dữ liệu

- [Google Sheet → Supabase](docs/google-sheet-supabase-sync.md): nguồn, project,
  bản script hiện hành, lịch chạy và cách tổ chức các job.
- [OPS incremental sync](docs/ops-incremental-sync.md): thay đổi ngày 09/10/2026,
  delta RPC, retry, kiểm tra và rollback; Leadtime đang pending tối ưu.
- [Raw → HCM](docs/raw-hcm-sync.md): bỏ dedup/history và giữ check result.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

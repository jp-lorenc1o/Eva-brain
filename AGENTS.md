# Project constraints

Eva V1 intentionally targets macOS only. Do not assume Windows or Linux
compatibility, or "fix" macOS-specific code such as the `iconutil`/`.iconset`
icon pipeline, `.DS_Store` handling, or the `$HOME` filesystem scope, unless a
cross-platform change is explicitly requested: none has been verified outside
macOS.

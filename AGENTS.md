# Project constraints

Eva V1 intentionally targets macOS only. Do not assume Windows or Linux
compatibility, or "fix" macOS-specific code such as the `iconutil`/`.iconset`
icon pipeline, `.DS_Store` handling, or the `$HOME` filesystem scope, unless a
cross-platform change is explicitly requested: none has been verified outside
macOS.

Eva V1 ships unsigned and unnotarized on purpose. Apple's Developer Program
costs $99/year, which is not justified for a personal project at this stage;
the documented `xattr -cr` workaround in the README and release notes is the
accepted trade-off. Do not treat code signing as an obvious pending task or
add signing/notarization steps to the release workflow unless the decision is
explicitly revisited.

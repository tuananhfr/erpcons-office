# ERPCons build image: fork gates, web builds and Windows cross-builds (MSI packaging stays on a Windows host).
# Mirrors the forks' ubuntu-24.04 CI runners; tool versions are pinned and checksummed.
FROM ubuntu:24.04

ARG RUST_VERSION=1.99.0
ARG TRUNK_VERSION=0.21.14
ARG TRUNK_SHA256=f2b4680cd239693a646a2795e4633c625328d7b2a044fbe749fa3a2fe9e7036b
ARG XWIN_VERSION=0.23.1
ARG XWIN_SHA256=c492c6dfb7e5ac0eee586b796e0fc950ba13077e7f0bbb046f445d71790d5360
ARG CYCLONEDX_VERSION=0.5.9
ARG CYCLONEDX_SHA256=fb8dbee9f182173e062a64a387b21a0badc6fab8b2abf9294973f012972bf6d8
ARG GH_VERSION=2.101.0
ARG GH_SHA256=9bca2d1c16825f109907a23307628a2f0698fbf99662b73a5cf0b020293072b8
ARG NODE_VERSION=24.22.1
ARG NODE_SHA256=6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:/usr/local/node/bin:$PATH \
    CARGO_TERM_COLOR=never \
    CARGO_INCREMENTAL=0 \
    XWIN_ACCEPT_LICENSE=1 \
    XWIN_CACHE_DIR=/root/.cache/cargo-xwin

# Carlito/Liberation: the forks' native UIs measure text with the Office-metric system fonts they look for, and
# DejaVu-only images fail layout tests (e.g. gridcraft cell times painted as ####).
# The workspace repos use extensions.relativeWorktrees (git >= 2.48); noble ships 2.43, hence the git-core PPA.
RUN apt-get update \
 && apt-get install -y --no-install-recommends software-properties-common gpg-agent \
 && add-apt-repository -y ppa:git-core/ppa \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git xz-utils build-essential python3 openssl rsync openssh-client \
      pkg-config libasound2-dev libgl1-mesa-dev libxkbcommon-dev libwayland-dev libx11-dev libxcursor-dev libxrandr-dev \
      libxi-dev libgtk-3-dev libfontconfig1-dev libfreetype-dev mesa-vulkan-drivers \
      clang lld llvm binutils-mingw-w64-x86-64 \
      fonts-crosextra-carlito fonts-liberation \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory '*'

RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal --default-toolchain "$RUST_VERSION" \
 && rustup component add clippy rustfmt \
 && rustup target add wasm32-unknown-unknown x86_64-pc-windows-msvc

RUN set -eu; \
    fetch() { curl -fsSL --retry 3 -o "$1" "$2"; echo "$3  $1" | sha256sum -c -; }; \
    cd /tmp; \
    fetch trunk.tgz "https://github.com/trunk-rs/trunk/releases/download/v$TRUNK_VERSION/trunk-x86_64-unknown-linux-gnu.tar.gz" "$TRUNK_SHA256"; \
    tar -xzf trunk.tgz -C /usr/local/cargo/bin trunk; \
    fetch xwin.tgz "https://github.com/rust-cross/cargo-xwin/releases/download/v$XWIN_VERSION/cargo-xwin-v$XWIN_VERSION.x86_64-unknown-linux-musl.tar.gz" "$XWIN_SHA256"; \
    tar -xzf xwin.tgz -C /usr/local/cargo/bin cargo-xwin; \
    fetch cdx.txz "https://github.com/CycloneDX/cyclonedx-rust-cargo/releases/download/cargo-cyclonedx-$CYCLONEDX_VERSION/cargo-cyclonedx-x86_64-unknown-linux-gnu.tar.xz" "$CYCLONEDX_SHA256"; \
    tar -xJf cdx.txz --strip-components=1 -C /usr/local/cargo/bin cargo-cyclonedx-x86_64-unknown-linux-gnu/cargo-cyclonedx; \
    fetch gh.tgz "https://github.com/cli/cli/releases/download/v$GH_VERSION/gh_${GH_VERSION}_linux_amd64.tar.gz" "$GH_SHA256"; \
    tar -xzf gh.tgz --strip-components=2 -C /usr/local/bin "gh_${GH_VERSION}_linux_amd64/bin/gh"; \
    fetch node.txz "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" "$NODE_SHA256"; \
    mkdir -p /usr/local/node && tar -xJf node.txz --strip-components=1 -C /usr/local/node; \
    rm -f /tmp/*.tgz /tmp/*.txz; \
    trunk --version && cargo xwin --version && cargo cyclonedx --version && gh --version && node --version && git --version

WORKDIR /ws

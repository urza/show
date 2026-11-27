# The build stage runs natively on the build machine and cross-compiles for the target arch.
# AOT builds under QEMU emulation are many times slower.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:11.0-resolute-aot AS build
ARG TARGETARCH
ARG BUILDARCH
# A cross build needs clang, because the SDK gives the linker a --target option that gcc does not
# have. The .NET 11 -aot image has only gcc. llvm brings llvm-objcopy, which can strip a binary of a
# foreign arch. The gcc and libc packages bring the linker and the C runtime of the target.
RUN if [ "$TARGETARCH" != "$BUILDARCH" ]; then \
      case "$TARGETARCH" in arm64) triple=aarch64-linux-gnu ;; amd64) triple=x86-64-linux-gnu ;; *) exit 1 ;; esac; \
      apt-get update && apt-get install -y --no-install-recommends \
        clang llvm "gcc-$triple" "binutils-$triple" "libc6-dev-$TARGETARCH-cross" \
      && rm -rf /var/lib/apt/lists/*; \
    fi
WORKDIR /src
COPY global.json Show.csproj ./
RUN dotnet restore -a $TARGETARCH
COPY . .
RUN dotnet publish -c Release -a $TARGETARCH --no-restore -o /out
# The runtime image has no shell, so this stage makes the empty data folder for it.
RUN mkdir /data

# Chiseled runtime-deps: no shell, no package manager, non-root user by default.
FROM mcr.microsoft.com/dotnet/runtime-deps:11.0-resolute-chiseled
WORKDIR /app
COPY --from=build /out/show .
# Docker copies the owner of this folder to a new volume. Without --chown the volume belongs to
# root, and the non-root user of this image cannot write the pages.
COPY --from=build --chown=$APP_UID:$APP_UID /data /data
VOLUME /data
# The base image sets ASPNETCORE_HTTP_PORTS=8080. Override it to keep the show port.
ENV ASPNETCORE_HTTP_PORTS=7469
EXPOSE 7469
ENTRYPOINT ["./show"]

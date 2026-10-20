# Verifying the release image

Release images at `ghcr.io/kaigothe/davnode` are built by GitHub Actions
for `linux/amd64` and `linux/arm64`, signed with
[cosign](https://github.com/sigstore/cosign) (keyless) and published with
an SBOM and build provenance.

```bash
cosign verify ghcr.io/kaigothe/davnode:<version> \
  --certificate-identity-regexp 'https://github.com/kaigothe/DavNode/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# Build attestation (SLSA provenance) and SBOM
gh attestation verify oci://ghcr.io/kaigothe/davnode:<version> --owner kaigothe
docker buildx imagetools inspect ghcr.io/kaigothe/davnode:<version> --format '{{ json .SBOM }}'
```

Pin the version (or the digest) in your compose file for reproducible
deployments instead of following `latest`.

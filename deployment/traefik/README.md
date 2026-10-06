Traefik notes for custom domains

- Traefik can automatically provision TLS certs (ACME) for many custom domains.
- Example Docker labels (service running on port 4000):

labels:
  - "traefik.enable=true"
  - "traefik.http.routers.qabila.rule=Host(`family.example.com`)"
  - "traefik.http.routers.qabila.entrypoints=websecure"
  - "traefik.http.routers.qabila.tls.certresolver=myresolver"
  - "traefik.http.services.qabila.loadbalancer.server.port=4000"

- For many dynamic domains you can use a wildcard router with `HostRegexp` and middleware, but certificate provisioning will require proper ACME DNS challenge for wildcard certificates (or per-host routers).
- In Kubernetes, use `IngressRoute` CRDs with `tls` configured and a certificate resolver.

Security: ensure `Host` header is forwarded to backend (Traefik does this by default).

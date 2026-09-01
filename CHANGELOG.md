# [1.1.0](https://github.com/kaigothe/DavNode/compare/v1.0.0...v1.1.0) (2026-08-31)


### Features

* **core:** add argon2id password hashing utility ([e6b734d](https://github.com/kaigothe/DavNode/commit/e6b734d308243ec27153a6e31a50db0958248d38))
* **core:** add BasicAuthProvider ([816ca12](https://github.com/kaigothe/DavNode/commit/816ca12f8c544d9043e7649a834572eaae5b4e11))
* **core:** add Credential entity for pluggable auth ([73c7c8d](https://github.com/kaigothe/DavNode/commit/73c7c8d2e2285bd88e21245561be31c3598c75ab))
* **core:** add Group and GroupMembership entities ([6a2a23b](https://github.com/kaigothe/DavNode/commit/6a2a23b8852ea04656af3e0a5b0fa4e9eba14cd4))
* **core:** add pluggable AuthProvider interface and registry ([3366190](https://github.com/kaigothe/DavNode/commit/3366190fd21408c8773991e852061f11b68c161c))
* **core:** add Principal entity for ACL identity references ([7314533](https://github.com/kaigothe/DavNode/commit/7314533cc449cbeb436a0687e8434f3d2230e00b))
* **core:** add principal URL mapping for user/group principals ([837926b](https://github.com/kaigothe/DavNode/commit/837926bbee4f9f2d3a4ab65dafe6da39f47e0467))
* **core:** add special-principals RFC 3744 XML element mapping ([1903f5a](https://github.com/kaigothe/DavNode/commit/1903f5ac7c55d8ea69e24d4344f273a975093b84))
* **core:** add Tenant entity with multi-tenancy quota fields ([7831cfe](https://github.com/kaigothe/DavNode/commit/7831cfe87f1c3206afa4b5d64c69314dd2fc902b))
* **core:** add TenantService with transactional bootstrap ([60dd5e5](https://github.com/kaigothe/DavNode/commit/60dd5e592115fdca90ad1d4a6740c23cb7ec5d16))
* **core:** add User entity with per-tenant username uniqueness ([dc1462c](https://github.com/kaigothe/DavNode/commit/dc1462c79121d15e951952c7f137fc22e3866322))

# 1.0.0 (2026-08-31)


### Bug Fixes

* **repo:** build workspaces before generating docs ([c4d7c9e](https://github.com/kaigothe/DavNode/commit/c4d7c9e97246426cc7909505ef37ba79f7b75108))
* **repo:** exclude tsbuildinfo files from the Docker build context ([23d7a32](https://github.com/kaigothe/DavNode/commit/23d7a3270821d23f4e9fcc09063b56c246759cb8))
* **repo:** pin TypeScript to 6.0.3 instead of the 7.x latest tag ([ee625fd](https://github.com/kaigothe/DavNode/commit/ee625fd89310ff6cfda866268d25a75ea62fd660))


### Features

* **core:** add TypeORM DataSource configuration ([765c243](https://github.com/kaigothe/DavNode/commit/765c243cce3beb966aa8747f59e7999565f50c0d))
* **core:** add TypeORM migration workflow ([5c7fd54](https://github.com/kaigothe/DavNode/commit/5c7fd54e76f043dad07cd12fa9c0416e53b2a1ad))
* **repo:** add app service, MySQL profile, and .env.example ([960c5cf](https://github.com/kaigothe/DavNode/commit/960c5cff0813c8eeb02b0c4aff259ceecf6e211e))
* **repo:** add ESLint and Prettier tooling ([d1c26f2](https://github.com/kaigothe/DavNode/commit/d1c26f25cd362d0eb0984dde1fda49fd215c9d22))
* **repo:** add GitHub Actions CI workflow ([8b5ee21](https://github.com/kaigothe/DavNode/commit/8b5ee21351eee231cdba1a5cdaab1017d8407d6b))
* **repo:** add multi-stage Dockerfile ([8874605](https://github.com/kaigothe/DavNode/commit/88746052833584250a311b20f2b11a80fb1f8372))
* **repo:** add semantic-release configuration ([803a733](https://github.com/kaigothe/DavNode/commit/803a733b14cc3f249820a8ebe0606bd00fb5d655))
* **repo:** add semantic-release job to CI ([4836f77](https://github.com/kaigothe/DavNode/commit/4836f77b5873b089d6b88335f2bef203bec1d8e8))
* **repo:** add strict TypeScript config with project references ([8872316](https://github.com/kaigothe/DavNode/commit/8872316255a70e9216c1056cb5bfa284cae5698b))
* **repo:** add TypeDoc API documentation generation ([f809d87](https://github.com/kaigothe/DavNode/commit/f809d8780a303b7a144d87e1873cb911c87bd43b))
* **repo:** add Vitest workspace setup with example tests ([28ad027](https://github.com/kaigothe/DavNode/commit/28ad027e00d278a09ba4523205c5a4c2f1014c9a))
* **repo:** enforce Conventional Commits via commitlint + Husky ([f3a0d50](https://github.com/kaigothe/DavNode/commit/f3a0d508556c53242df0448683c7d144e2ac6b8d))
* **repo:** enforce TSDoc comments on exported package APIs ([53ec484](https://github.com/kaigothe/DavNode/commit/53ec4841124e43e5fc6ed419b8da1990afe49b00))
* **repo:** scaffold core/server/admin-api packages ([9bdf039](https://github.com/kaigothe/DavNode/commit/9bdf039c951a9e5cc774af98d35b454f3ac06e0f))

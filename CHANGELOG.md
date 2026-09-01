# [1.4.0](https://github.com/kaigothe/DavNode/compare/v1.3.0...v1.4.0) (2026-09-01)


### Features

* **core:** add CollectionAce and FileAce entities ([68292fc](https://github.com/kaigothe/DavNode/commit/68292fc37f22761557fc3c8780a7d77331d73e2e))
* **core:** add default-owner ACE creation to resource-creation paths ([df72807](https://github.com/kaigothe/DavNode/commit/df72807b292b58742c9c327da4e7e28a7ee23b04))
* **core:** add privilege aggregation resolution ([4778655](https://github.com/kaigothe/DavNode/commit/47786553304ffc2558fd53fe6290c1c8be3d9103))

# [1.3.0](https://github.com/kaigothe/DavNode/compare/v1.2.0...v1.3.0) (2026-09-01)


### Features

* **server:** add COPY route ([29f18d2](https://github.com/kaigothe/DavNode/commit/29f18d2b4985267216861144ba8018f195022c8b))
* **server:** add MOVE route ([91b9da6](https://github.com/kaigothe/DavNode/commit/91b9da64e923cb15e1b74b255de45c92f2fdc355))

# [1.2.0](https://github.com/kaigothe/DavNode/compare/v1.1.0...v1.2.0) (2026-09-01)


### Bug Fixes

* **ci:** stop leaking DAVNODE_DB_TYPE into the vitest suite's env ([d7a22cb](https://github.com/kaigothe/DavNode/commit/d7a22cbe612d821d04e9c76f01253e7779894fd0))
* **core:** split migration history per database engine ([9ae1ab1](https://github.com/kaigothe/DavNode/commit/9ae1ab14377120808631db4c3ae7aab1f02668e6))


### Features

* **core:** add CLI bootstrap script for first tenant + admin user ([8e3fbbb](https://github.com/kaigothe/DavNode/commit/8e3fbbbf005f4b5d73e82baa595d1e8d68cd06fa))
* **core:** add Collection entity for the WebDAV domain ([bb95b84](https://github.com/kaigothe/DavNode/commit/bb95b8478e6c5783686b35579830234bbcdef19b))
* **core:** add CollectionProperty and FileProperty dead-properties tables ([edf3734](https://github.com/kaigothe/DavNode/commit/edf3734f6cd56cadc373a006d17dd0274350a7b8))
* **core:** add FileResource and FileContent entities ([5a0aaef](https://github.com/kaigothe/DavNode/commit/5a0aaeff73c17642446ab542f078a665dd201f2e))
* **core:** add GroupMembershipService with cycle detection ([9b25527](https://github.com/kaigothe/DavNode/commit/9b25527ea782bb549e88ff629fa41471faeb5093))
* **core:** add GroupService with cascading membership cleanup ([939dc4c](https://github.com/kaigothe/DavNode/commit/939dc4c90bd1a1f5a437ff58487d88a57a8c17cb))
* **core:** add property-provider abstraction for WebDAV live properties ([89c76c2](https://github.com/kaigothe/DavNode/commit/89c76c2c3266d8edeadf56327e9ac54dd4e1a37d))
* **core:** add UserService with transactional account creation ([573268d](https://github.com/kaigothe/DavNode/commit/573268d889cb917b57d3fa8ce105f04707457597))
* **core:** add WebDAV XML request-parsing and multistatus infrastructure ([1fa0530](https://github.com/kaigothe/DavNode/commit/1fa0530cd28cc360dfa9bf037b261988a0169461))
* **core:** create the tenant's root collection during bootstrap ([e0b98ed](https://github.com/kaigothe/DavNode/commit/e0b98eda218e8f0edea21dc8bfd71806861ef2cb))
* **server:** add DELETE route ([b85204c](https://github.com/kaigothe/DavNode/commit/b85204c1433441542fe84e4d8b2090df6ae92b1e))
* **server:** add Express app and real server entrypoint ([dc1544f](https://github.com/kaigothe/DavNode/commit/dc1544f4c2aa9dbda25edf54b6d45e0b9c40a6b7))
* **server:** add GET route ([7002995](https://github.com/kaigothe/DavNode/commit/70029958a77de9f230f4c178748a75514964c236))
* **server:** add HTTP Basic Auth middleware ([fd0c98c](https://github.com/kaigothe/DavNode/commit/fd0c98c34cf47fc6be5a44810c9c5d2f0b1308c4))
* **server:** add MKCOL route ([8eab8bf](https://github.com/kaigothe/DavNode/commit/8eab8bf2da20de11ecefaaf0399ef02b004c2049))
* **server:** add owner-only authorization and central error handling ([cc56356](https://github.com/kaigothe/DavNode/commit/cc56356b4334e959b9747870f9c71fe474384987))
* **server:** add PROPFIND route ([20e91e1](https://github.com/kaigothe/DavNode/commit/20e91e180053c7d94abd5efee937e7c70cba91ec))
* **server:** add PROPPATCH route ([a89039a](https://github.com/kaigothe/DavNode/commit/a89039af558d48544f29f01dc9b464d11d965acb))
* **server:** add PUT route ([795d6c0](https://github.com/kaigothe/DavNode/commit/795d6c0ee61c5c81056c518419b445744976cf4f))
* **server:** add tenant-resolution middleware ([5e1b6d7](https://github.com/kaigothe/DavNode/commit/5e1b6d772971d433bec0f09cad3e29b1b8c30082))

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

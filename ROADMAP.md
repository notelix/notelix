* [ ] support docker compose; publish docker image
* [ ] automated data backup script
* [ ] front end dashboard, supporting search, annotation management, etc
* [ ] add user docs, screenshots, etc.
* [ ] add installation guide
* [ ] free public server
* [ ] chrome web store
* [ ] context menu to temporarily disable highlighter
* [ ] support adding multiple comments to one annotation
* [ ] shortcut to jump to the previous / next annotation
* [ ] refactor code
* [ ] re-implement client-side encryption in a way that can support every feature including dashboard and search. To
  achieve this, the user will be asked to use docker-compose to run notelix backend services (e.g. MeiliSearch) locally.
  Those backend services will be run in such a way that it will fetch all user data from the server and decrypt them
  locally, and use the decrypted version to provide read API calls. When frontend wishes to write something, it will
  write directly to the remote server. The remote server will keep the list of diffs and try to push the diffs
  sequentially to the local server so that they are in sync. The remote server will keep at most 10000 recent diffs. If
  the gap between local and remote servers are larger than 10000 diffs, then the local server must re-download the full
  copy of data from remote and re-index everything (just like it would, the first time someone logs into a
  client-side-encryption-enabled account).
* [ ] (off-topic) highlighting ebooks? integration with calibre / JS based e-readers?  

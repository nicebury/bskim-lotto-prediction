---
type: ops
title: "WSL drvfs 함정 — 디렉토리 rename 후 캐시 오염"
description: "NTFS(/mnt/d) 위에서 디렉토리를 rename 하면 WSL 의 dentry 캐시가 깨져 '없는데 있는' 상태가 된다"
tags: [ops, pitfall]
owner: shared
status: stable
sources: ["세션 실측 2026-07-09"]
created: 2026-07-09
updated: 2026-07-09
---

# WSL drvfs 함정 — 디렉토리 rename 후 캐시 오염

이 저장소는 Windows 의 `D:\` 드라이브에 있고 WSL 이 `/mnt/d` 로 마운트해 쓴다(drvfs). **WSL 안에서 디렉토리를 rename 하면 파일이 사라진 것처럼 보인다.** 실제로는 사라지지 않았다.

이 함정을 모르면 "git 이 파일을 날렸다" 고 오판하고, 복구하려다 진짜로 지운다.

---

## 증상

`git mv frontend frontend_bak` 을 실행했다. 종료 코드는 `0` 이다. 그런데:

```console
$ ls -d frontend_bak
ls: cannot access 'frontend_bak': No such file or directory

$ ls -d frontend
ls: cannot access 'frontend': No such file or directory
```

**두 이름 모두 사라졌다.** `git status` 는 이렇게 말한다.

```console
RD frontend/index.html -> frontend_bak/index.html
warning: could not open directory 'frontend_bak/': No such file or directory
```

`R` 은 인덱스에 rename 이 스테이징됐다는 뜻이고, `D` 는 워킹트리에서 사라졌다는 뜻이다.

더 이상한 것은 이 조합이다. 커널과 캐시가 서로 다른 말을 한다.

```console
$ ls -a | grep frontend_bak
frontend_bak                                  # readdir 에는 있다

$ stat frontend_bak
stat: cannot statx 'frontend_bak': No such file or directory   # stat 은 없다 (ENOENT)

$ mkdir frontend_bak
mkdir: cannot create directory: File exists                    # mkdir 은 있다 (EEXIST)
```

그리고 `cp -a frontend/. frontend_bak/` 는 이렇게 거부한다.

```console
cp: 'frontend/./index.html' and 'frontend_bak/./index.html' are the same file
```

두 이름이 **같은 디렉토리를 가리키는 별칭**처럼 동작한다. 한쪽에 `rm -rf` 를 걸면 둘 다 사라진다.

---

## 원인

drvfs 의 dentry 캐시가 rename 이후 무효화되지 않는다. NTFS 쪽에서는 rename 이 **정상적으로 끝났는데**, WSL 의 VFS 계층은 옛 이름을 살아 있다고 믿고 새 이름을 없다고 믿는다.

`stat` 은 캐시를 보므로 `ENOENT`, `mkdir` 은 실제 FS 에 물어보므로 `EEXIST`. 이 모순이 진단의 결정적 단서다.

`stat` 이 보고하는 inode 번호는 신뢰할 수 없다. drvfs 는 inode 를 조작해 넘겨주므로 서로 다른 번호가 나오지만 실제로는 같은 디렉토리다. **inode 비교로 별칭 여부를 판정하지 마라.** `cp` 의 "are the same file" 경고가 더 믿을 만하다.

캐시는 마운트를 다시 걸거나 WSL 을 재시작해야 지워진다.

---

## 해법

### 1. 먼저 Windows 쪽 진실을 확인한다

WSL 을 믿지 말고 NTFS 에 직접 묻는다.

```bash
powershell.exe -NoProfile -Command \
  "Get-ChildItem -Force 'D:\bskim_dev\bskim-lotto-prediction' | Select-Object -ExpandProperty Name"
```

십중팔구 rename 은 성공해 있고 파일도 전부 있다. **`rm -rf` 를 치기 전에 이걸 먼저 한다.**

### 2. 디렉토리 rename 은 Windows 쪽에서 한다

```bash
powershell.exe -NoProfile -Command \
  "Rename-Item 'D:\...\frontend_legacy' -NewName 'frontend_old'"
```

WSL 은 그 새 이름을 캐싱한 적이 없으므로 즉시 정상적으로 본다. 그 뒤 `git add -A` 로 rename 을 스테이징하면 git 이 알아서 `R` 로 인식한다.

### 3. 이미 오염된 이름은 버린다

한 번 오염된 이름(`frontend_bak`)은 WSL 을 재시작하기 전까지 그 세션에서 쓸 수 없다. **다른 이름을 고르는 편이 빠르다.** 굳이 그 이름을 써야 한다면 Windows PowerShell 에서 `wsl --shutdown` 후 재접속한다.

---

## 왜 데이터는 안전한가

세 곳에 남아 있다.

1. **git HEAD** — 추적 파일은 커밋에 있다. `git ls-tree -r HEAD --name-only` 로 확인한다.
2. **git 인덱스** — rename 이 스테이징됐다면 `git ls-files` 에 보인다.
3. **NTFS** — PowerShell 로 보면 실제 파일이 그대로 있다.

**절대 하지 말 것**: 워킹트리가 비어 보인다고 `rm -rf` 로 "정리" 한 뒤 다시 만들기. 별칭 때문에 진짜 데이터를 지운다. 추적되지 않는 것(`node_modules`, 로컬 `.env`)은 git 이 복구해 주지 않는다.

---

## 관련 결정

이 저장소가 과거 SQLite 를 `journal_mode=DELETE` 로 고정했던 것도 같은 뿌리의 문제였다 — `.db-wal` / `.db-shm` 사이드카 파일이 Windows 측 락에 걸려 쓰기가 불가능해졌다. Postgres 로 옮기면서 그 제약은 사라진다 ([[0005-postgres-migration]]).

**교훈**: `/mnt/*` 위의 파일에 대해 리눅스 파일시스템 의미론을 온전히 기대하지 않는다. 원자적 rename, 락, inode, 심볼릭 링크 모두 drvfs 에서 정직하지 않다.

관련: [[local-setup]] · [[0005-postgres-migration]] · [[deployment]]

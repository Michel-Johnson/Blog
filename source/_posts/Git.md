---
title: Git Commands
date: 2025-08-26 23:13:18
categories:
- Terminal Command
tags:
- Git
description: This is a basic Git tutorial.
---

## Introduction

This post will list some frequently used commands. My operating system is Ubuntu 24.04.02.🧐

## Repository

Repository includes all the projects, you need to create a folder to create a repository.
I will create a folder called "git_test"

```shell
mkdir git_test
cd git_test
git init
```

I have a file named "test.c" in this folder, enter `git add test.c ` to place the file into Git's staging area.
If you have other files, and you want to put all these files into the Git staging area at once, enter ` git add .` 
If you have finished modifying all the files and have put them into Git's staging area, enter ` git commit -m "...Your commit message..." `

![git commit](/images/git_commit.png)

You can view previous commit records by typing `git log`
![git_log](/images/git_log.png)
If you want to revert to a previous version, enter `git reset --hard <Version>` 
`<Version>` can be a commit hash (e.g., `d118c`) or a relative reference (e.g., `HEAD^`).

There are two ways to specify the version in `<Version>`

1. Relative addressing
   The current version is represented by `HEAD`. If you want to go to the previous version, enter `HEAD^`.The version before last is `HEAD^^`. The 10th previous version is `HEAD~10`.

2. ID addressing

   If you want to go to the "second version" in the image, enter ` d118`or `d118c`, at least four characters and ensure there is no ambiguity.

`git reset --hard d118`	or	`git reset --hard HEAD^`

Now we are at "second commit", type `git log`.
![git_log2](/images/git_log2.png)
At this point, we find that we cannot view the ID of "third commit". If you want go to "third  commit" but don't know its ID, type `git reflog`
![git_reflog](/images/git_reflog.png)
Enter `git reset --hard e398`
Now  you have entered "third commit".

## Branch

Use `git branch` to view all branches.
Use `git checkout master` to switch to the "master" branch.
Use `git branch name`  to create a new branch called "name", but the HEAD pointer will not move to `name`.
Use `git checkout -b name2` to create a new branch and point HEAD to `name2`.
Merge the `name2` branch into the master branch and delete `name2` :

```shell
git checkout master
git merge name2
git branch -d name2
```



## Remote Git repository

I will take GitHub as an example. And I will name this remote repository "git_test".
```shell
git remote add git_test git@github.com:username/your_repo.git
git push git_test master
```

If you haven't configured the SSH key for the current machine on GitHub before, follow these steps:

```shell
ssh-keygen -t ed25519 -C "your_github_email@email.com"
cat ~/.ssh/id_ed25519.pub
```

Copy the displayed key. Open Github, go to settings -->SSH and GPG keys -->New SSH key.
Give it a name and paste the key.

```shell
ssh -T git@github.com
```

If a `Hi <username>! You've successfully authenticated, but GitHub does not provide shell access.` prompt appears, it means you have successfully configured it.🤓

If `ssh: connect to host github.com port 22: Connection refused` appears, it means that port 22 cannot connect normally😭. Don't worry, we can use GitHub's alternative SSH port 443.🧐

```shell
nano ~/.ssh/config
```

Copy the following content:

```
Host github.com
  HostName ssh.github.com
  Port 443
  User git
```

- Press `Ctrl+Shift+V` to paste.
- Press `Ctrl+O` to save, then `Enter` to confirm.
- Press `Ctrl+X` to exit.

```shell
ssh -T git@github.com
yes
```

Then `Hi <username>! You've successfully authenticated, but GitHub does not provide shell access.` will appear.😊

Try `git push git_test master` again.
![git_success](/images/git_success.png)
Congratulations!✌️

## Further learning📚

- [Git官方文档](https://git-scm.com/book/zh/v2)
- [Git分支学习](https://learngitbranching.js.org/?locale=zh_CN)
- [廖雪峰个人博客](https://www.liaoxuefeng.com/wiki/896043488029600)
- [知乎](https://zhuanlan.zhihu.com/p/615581394)
- [Git 教程 | 菜鸟教程](https://www.runoob.com/git/git-tutorial.html)

 ## References🧐:

1. https://docs.net9.org/basic/git/.
2. https://blog.csdn.net/qcwl66/article/details/144968361
3. https://zhuanlan.zhihu.com/p/1910420791494972983 

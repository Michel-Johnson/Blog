---
title: Hexo Commands
date: 2025-08-19 12:31:04
categories:
- Terminal Command
tags:
- hexo
description: This is a list of common Hexo commands.
---

# Hexo Commands

## Create Post

```shell
hexo new post "new post"
```

Then you will find "new post" stored in the path "/source/_posts/new post"

## Create Draft

```c
hexo new draft "new draft"
```

Then you will find "new draft" stored in the path "/source/_drafts/new draft"
If you have finished your draft ,and you want to publish it.

```c
hexo publish "new draft"
```

Then you will find "new draft" in the path "/source/_posts/new draft"

## Create Categories

```c
hexo new page categories
```

Then you will find the file "index.md" in the path "/source/categories/index.md",open and change it to
```c
title: categories
date: 2025-08-17 17:23:10
type: "categories"
```

Save and close the file, and you can add "categories" in your posts.
```c
title: object post
date: 2025-08-17 17:23:10
categories:
- first category
- second category
```

## Create Tags

Similar to "Create Categories"
```c
hexo new page tags
```

Change index.md to
```c
title: tags
date: 2025-08-19 12:25:09
type: "tags"
```

Save and close the file, and you can add "tags" in your posts.

```c
title: esp32
date: 2025-08-18 00:24:37
categories:
- MCU
tags:
- study notes
```



## Add Images

I advise you create a folder in the path "/source/images"
Then you can copy your images to this folder, and then copy the image that in the folder you have created.

```c
![test](E:\Hexo-Blog\source\images\test.png)
//In Typora, you will have this format.
```

If your server were running on a Windows operating system,change it to:

```c
![test](\images\test.png)
```

If your server were running on a Linux operating system,change it to:

```c
![test](/images/test.png)//Actually you can use this format in windows server,too.
```

Then you can find the image in your websites!

![test3](/images/test3.png)

![test](/images/test.png)

## Remote Blog Posting

🧐Attention: You need to set your git and your server , detailed tutorial will be posted later.

```c
hexo clean
hexo g -d
```














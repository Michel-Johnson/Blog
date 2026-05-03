---
title: BEV
date: 2025-10-23 22:40:04
tags:
categories:
- CV
description: BEV学习笔记（初步了解）
---

# BEV

Ref:

[BEV算法之我见——过去、现状以及未来 - 知乎](https://zhuanlan.zhihu.com/p/1957046496672318888)

[BEV系列一：BEV介绍和常用BEV算法简介 - 知乎](https://zhuanlan.zhihu.com/p/633483313)



Bird's Eye View，简称BEV

> 为什么要使用BEV算法？
> 我的理解：自动驾驶中不同角度的传感器想要融合，需要在将他们转换到同一个角度，这样才能继续分析，而BEV就将他们都投影到到鸟瞰平面，便于分析。



## IPM（Inverse Perspective Mapping）

在现实世界本来平行的事物，最终却相交，这正是由于透视效应，而IPM也就是逆透视变换

我用ai生成了一段[IPM算法](https://github.com/Michel-Johnson/Group-Meeting/blob/main/BEV/BEV_IPM/IPM.py)的代码，其通过调用opencv库实现

标注点顺序为：左下、右下、右上、左上

![IPM](/images/IPM.png)

那么，如果地面不平坦，会发生什么呢？![IPM2](/images/IPM2.png)![IPM3](/images/IPM3.png)

可以发现，当地面有起伏时，IPM有较大的失真，这不难理解，下面我们简单分析一下IPM的算法

```python
#透视变换核心
src = np.float32(points)  # 源点（原图中选的4点）
dst = np.float32([[0,800], [800,800], [800,0], [0,0]])  # 目标矩形
M = cv2.getPerspectiveTransform(src, dst)           # 计算变换矩阵
warped = cv2.warpPerspective(image, M, (800, 800))   # 执行逆透视变换
```

我们可以发现，核心在于矩阵变换，这里我们需要了解相应的数学知识，这一部分包括在[github的仓库](https://github.com/Michel-Johnson/Group-Meeting/blob/main/BEV/BEV_IPM/BEV_IPM_Math.pdf)中，是我手写的pdf版本，你需要了解什么是单应性矩阵，只需要简单掌握概念，其余推导过程和解释都将包括在pdf中。

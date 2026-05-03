---
title: STM32
date: 2025-08-18 00:24:25
categories:
- MCU
tags:
- study notes
---

# STM32-Standard Peripheral Libraries

## Introduction

This guide uses STM32F103C8T6 Minimum System Board.
Keil will be the compilation and debugging software.
Visual Studio Code will be the software for editing code.

If I have made any mistakes, contact me by micheljohnsonofficial@gmail.com

  ## 1.GPIO

In the first chapter, let's study the GPIO of STM32.
Nearly all the guide will start from lighting a LED, and we will do the same.
To be honest , while it's easy to edit, compile and load the code onto the MCU, understanding the mechanism of why and how it lights up is not as straightforward. Not everybody want to get it clear, they just need to master a MCU and finish the project as quick as possible. But there is still someone like me want to study it clearly, so I will introduce the code first, then I analyze the mechanism. Trust me, it's will be interesting to study the mechanism.

```c
#include "stm32f10x.h"

void LED_Board_Init()
{
   RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOC,ENABLE);//Enable port clock
GPIO_InitTypeDef   GPIO_InitStruct = {0}; //Must be initialized
GPIO_InitStruct.GPIO_Pin = GPIO_Pin_13;
GPIO_InitStruct.GPIO_Mode = GPIO_Mode_Out_PP;/push-pull mode
GPIO_InitStruct.GPIO_Speed=GPIO_Speed_2MHz; 
GPIO_Init(GPIOC,&GPIO_InitStruct); 
}

void main()
{
    GPIO_WriteBit(GPIOC, GPIO_Pin_13, Bit_RESET);
while(1){
}
}

```






























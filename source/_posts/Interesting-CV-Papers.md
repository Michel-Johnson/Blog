---
title: Interesting CV Papers
date: 2025-10-10 13:20:46
tags:
categories:
- CV
description: 这个post包含我感兴趣的文章，其中高亮的是较为关注的研究方向。主要是3D场景定位/3D姿态理解/3D姿态生成以及长视频理解/生成。其实有很多文章我不能确定是否感兴趣，因为有很多名词我不太熟悉，初看时很多看不懂论文题目。后面的文章标题我使用AI自动翻译，所以部分单词翻译不够准确。
---



# Interesting CV Papers

选出来的论文好多都是3D😂😂😂

## ICCV2025

1. [Why LVLMs Are More Prone to Hallucinations in Longer Responses: The Role of Context](https://openaccess.thecvf.com/content/ICCV2025/html/Zheng_Why_LVLMs_Are_More_Prone_to_Hallucinations_in_Longer_Responses_ICCV_2025_paper.html)

   对LLVMs模型的幻觉缺陷进行深入研究，探索产生幻觉的原因，并给出了一些抑制幻觉的方法

2. 

## CVPR2023-2025

1. [==Uni4D: Unifying Visual Foundation Models for 4D Modeling from a Single Video==](https://openaccess.thecvf.com/content/CVPR2025/html/Yao_Uni4D_Unifying_Visual_Foundation_Models_for_4D_Modeling_from_a_CVPR_2025_paper.html)

   Uni4D:从一个视频统一用于4D建模的视觉基础模型
   Author: David Yifan Yao
   Affiliation: University of Illinois at Urbana-Champaign

   > We introduce Uni4D, a multi-stage optimization framework that harnesses multiple pretrained models to advance dynamic 3D modeling, including static/dynamic reconstruction, camera pose estimation, and dense 3D motion tracking. 

   主要是4D场景理解，对相机角度/姿态有分析

2. [==The Language of Motion: Unifying Verbal and Non-verbal Language of 3D Human Motion==](https://openaccess.thecvf.com/content/CVPR2025/html/Chen_The_Language_of_Motion_Unifying_Verbal_and_Non-verbal_Language_of_CVPR_2025_paper.html)
   Author: Changan Chen
   Affiliation: Stanford University

   > In this paper, we propose a novel framework that unifies verbal and non-verbal language using multimodal language models for human motion understanding and generation.

   多模态语言理解

   ![CV1](/images/CV1.png)

3. [==CALICO: Part-Focused Semantic Co-Segmentation with Large Vision-Language Models==](https://openaccess.thecvf.com/content/CVPR2025/html/Nguyen_CALICO_Part-Focused_Semantic_Co-Segmentation_with_Large_Vision-Language_Models_CVPR_2025_paper.html)

   基于LVLM的局部语义协同分割
   Author :Kiet A. Nguyen
   Affiliation: University of Illinois Urbana-Champaign
   ![CV2](/images/CV2.png)

   挺有意思的，对物体组成部分进行分割/理解有助于多图像理解，但不知道在3D场景/视频理解中能否实现？

4. [Words or Vision: Do Vision-Language Models Have Blind Faith in Text?](https://openaccess.thecvf.com/content/CVPR2025/html/Deng_Words_or_Vision_Do_Vision-Language_Models_Have_Blind_Faith_in_CVPR_2025_paper.html)

   VLMs是否盲目相信文本？
   Author: Ailin Deng
   Affiliation: National University of Singapore

   > VLMs disproportionately trust textual data over visual data when inconsistencies arise, leading to significant performance drops under corrupted text and raising safety concerns. 

   关于视觉与文本输入不一致时产生的问题/原因/解决方法
   在受损文本下模型性能显著下降，因此要找到合适的方法去平衡文本与视觉输入

5. [Multi-Layer Visual Feature Fusion in Multimodal LLMs: Methods, Analysis, and Best Practices](https://openaccess.thecvf.com/content/CVPR2025/html/Lin_Multi-Layer_Visual_Feature_Fusion_in_Multimodal_LLMs_Methods_Analysis_and_CVPR_2025_paper.html)
   Author: Junyan Lin
   Affiliation:.......

   侧重于多层视觉特征，这个需要再了解一下

6. [Evaluating Vision-Language Models as Evaluators in Path Planning](https://openaccess.thecvf.com/content/CVPR2025/html/Aghzal_Evaluating_Vision-Language_Models_as_Evaluators_in_Path_Planning_CVPR_2025_paper.html)
   评估视觉语言模型作为路径规划评估器

   Author: Mohamed Aghzal
   Affiliation: George Mason University, 2Carnegie Mellon University, 3National Science Foundation

   > “Motivated by the intuition that “evaluation is easier than generation”
   > We introduce PATHEVAL, a novel benchmark evaluating VLMs as plan evaluators in complex path-planning scenarios.

   让VLM去评估规划的路径而不是规划路径

7. [==LSNet: See Large, Focus Small==](https://openaccess.thecvf.com/content/CVPR2025/html/Wang_LSNet_See_Large_Focus_Small_CVPR_2025_paper.html)

   Author: Ao Wang
   Affiliation: THU

   > It can efficiently capture a wide range of perceptual information and achieve precise feature aggregation for dynamic and complex visual representations, thus enabling proficient processing of visual information.

   侧重于轻量级的视觉网路设计，挺有前景的

8. [VideoDirector: Precise Video Editing via Text-to-Video Models](https://openaccess.thecvf.com/content/CVPR2025/html/Wang_VideoDirector_Precise_Video_Editing_via_Text-to-Video_Models_CVPR_2025_paper.html)

   Author: Yukun Wang
   Affiliation: Shenzhen Campus of Sun Yat-sen University, Sun Yat-sen University, THU, National University of Defense Technology
   ![CV3](/images/CV3.png)

   > we propose a spatial-temporal decoupled guidance (STDG) and multi-frame null-text optimization strategy to provide pivotal temporal cues for more precise pivotal inversion.时空解耦

   图我看懂了，感觉很厉害，但摘要没看太懂，总之就是文章有一些方法，能够保持复杂时空布局（spatial-temporal layout ），然后这个方法在各方面都优于现有技术

9. [==Instruction-based Image Manipulation by Watching How Things Move==](https://openaccess.thecvf.com/content/CVPR2025/html/Cao_Instruction-based_Image_Manipulation_by_Watching_How_Things_Move_CVPR_2025_paper.html)

   Author: Mingdeng Cao
   Affiliation: The University of Tokyo， Adobe

   可以仔细看看这篇,T2I

   ![CV4](/images/CV4.png)

10. [CoT-VLA: Visual Chain-of-Thought Reasoning for Vision-Language-Action Models](https://openaccess.thecvf.com/content/CVPR2025/html/Zhao_CoT-VLA_Visual_Chain-of-Thought_Reasoning_for_Vision-Language-Action_Models_CVPR_2025_paper.html)

    Author: Qingqing Zhao
    Affiliation: NVIDIA ，Stanford University ，MIT
    VLA(视觉语言动作)

    > In this paper, we introduce a method that incorporates explicit visual chain-of-thought (CoT) reasoning into vision-language-action models(VLAs) by predicting future image frames autoregressively as visual goals before generating a short action sequence to achieve these goals

    性能很强

11. [Motion-Grounded Video Reasoning: Understanding and Perceiving Motion at Pixel Level](https://openaccess.thecvf.com/content/CVPR2025/html/Deng_Motion-Grounded_Video_Reasoning_Understanding_and_Perceiving_Motion_at_Pixel_Level_CVPR_2025_paper.html)

    基于运动的视频推理：理解和感知像素级的运动

    Author: Andong Deng
    Affiliation: CRCV, University of Central Florida, 2University of Western Australia,3UNC, Chapel Hill, 4Amazon Web Services, 5 The University of Texas at Dallas

    运动理解，视频推理，但摘要没看懂

12. [Learning Visual Generative Priors without Text](https://openaccess.thecvf.com/content/CVPR2025/html/Ma_Learning_Visual_Generative_Priors_without_Text_CVPR_2025_paper.html)

    Author: Shuailei Ma
    Affiliation: College of Information Science and Engineering, Northeastern University, Shenyang 110819, China2 Ant Group 3 Shanghai Jiao Tong University 4 Alibaba Group 5 HKUST

    study image-to-image (I2I) generation

13. [AirRoom: Objects Matter in Room Reidentification](https://openaccess.thecvf.com/content/CVPR2025/html/Yao_AirRoom_Objects_Matter_in_Room_Reidentification_CVPR_2025_paper.html)

    Author: Runmao Yao
    Affiliation: Spatial AI & Robotics (SAIR) Lab, University at Buffalo

    侧重于房间（室内）的识别

14. [AdaCM^2: On Understanding Extremely Long-Term Video with Adaptive Cross-Modality Memory Reduction](https://openaccess.thecvf.com/content/CVPR2025/html/Man_AdaCM2_On_Understanding_Extremely_Long-Term_Video_with_Adaptive_Cross-Modality_Memory_CVPR_2025_paper.html)

    基于自适应跨模态记忆缩减的超长视频理解

    Author: Yuanbin Man
    Affiliation: University of Texas， University of Georgia， University of Houston

    关注理解长时视频，具体方法还得看看全文

    ![CV5](/images/CV5.png)

15. [BOLT: Boost Large Vision-Language Model Without Training for Long-form Video Understanding](https://openaccess.thecvf.com/content/CVPR2025/html/Liu_BOLT_Boost_Large_Vision-Language_Model_Without_Training_for_Long-form_Video_CVPR_2025_paper.html)

    无需训练的大型视觉语言模型用于长格式视频理解

    Author: Shuming Liu
    Affiliation: King Abdullah University of Science and Technology

    提出了一种新的长视频采样方法: BOLT

    > a method to BOost Large VLMs without additional Training through a comprehensive study of frame selection strategies.Our results show that inverse transform sampling yields the most significant performance improvement, increasing accuracy on the Video-MME benchmark from 53.8% to 56.1% and MLVU benchmark from 58.9% to 63.4%. 

16. [RoboPEPP: Vision-Based Robot Pose and Joint Angle Estimation through Embedding Predictive Pre-Training](https://openaccess.thecvf.com/content/CVPR2025/html/Goswami_RoboPEPP_Vision-Based_Robot_Pose_and_Joint_Angle_Estimation_through_Embedding_CVPR_2025_paper.html)

    RoboPEPP：基于视觉的机器人姿态和关节角度估计方法

    Author: Raktim Gautam Goswami
    Affiliation: New York University Tandon School of Engineering ,New York University Courant Institute of Mathematical Sciences  ,Meta-FAIR

    通过视觉来感知机器人的姿态，未来可能在机器人协作中有应用

17. ==[Perception Tokens Enhance Visual Reasoning in Multimodal Language Models](https://openaccess.thecvf.com/content/CVPR2025/html/Bigverdi_Perception_Tokens_Enhance_Visual_Reasoning_in_Multimodal_Language_Models_CVPR_2025_paper.html)==

    Author: Mahtab Bigverdi
    Affiliation: University of Washington, Google Research

    与3D推理有关，可以仔细看看

    > To address this, we introduce Perception Tokens, intrinsic image representations designed to assist reasoning tasks where language is insufficient. 

18. [LSceneLLM: Enhancing Large 3D Scene Understanding Using Adaptive Visual Preferences](https://openaccess.thecvf.com/content/CVPR2025/html/Zhi_LSceneLLM_Enhancing_Large_3D_Scene_Understanding_Using_Adaptive_Visual_Preferences_CVPR_2025_paper.html)
    Author: Hongyan Zhi
    Affiliation: South China University of Technology, Tencent Robotics X, Northeastern University,UMass Amherst,  Pazhou Laboratory, Sichuan University

   3D场景理解，根据任务生成视觉偏好，从而过滤冗余的视觉信息

19. [WonderWorld: Interactive 3D Scene Generation from a Single Image](https://openaccess.thecvf.com/content/CVPR2025/html/Yu_WonderWorld_Interactive_3D_Scene_Generation_from_a_Single_Image_CVPR_2025_paper.html)

   Author: Hong-Xing Yu
   Affiliation: Stanford University ，MIT

   3d场景生成

20. [Scene Splatter: Momentum 3D Scene Generation from Single Image with Video Diffusion Model](https://openaccess.thecvf.com/content/CVPR2025/html/Zhang_Scene_Splatter_Momentum_3D_Scene_Generation_from_Single_Image_with_CVPR_2025_paper.html)

    Author: Shengjun Zhang
    Affiliation: Tsinghua University, WeChat Vision,  Tecent Inc
    3d场景生成, 从单个图像生成3D场景

21. [Video-3D LLM: Learning Position-Aware Video Representation for 3D Scene Understanding](https://openaccess.thecvf.com/content/CVPR2025/html/Zheng_Video-3D_LLM_Learning_Position-Aware_Video_Representation_for_3D_Scene_Understanding_CVPR_2025_paper.html)

    Author: Duo Zheng
    Affiliation: The Chinese University of Hong Kong
    3D 场景理解

    > By treating 3D scenes as dynamic videos and incorporating 3D position encoding into these representations, our Video-3D LLM aligns video representations with real-world spatial contexts more accurately.

22. [Text-guided Sparse Voxel Pruning for Efficient 3D Visual Grounding](https://openaccess.thecvf.com/content/CVPR2025/html/Guo_Text-guided_Sparse_Voxel_Pruning_for_Efficient_3D_Visual_Grounding_CVPR_2025_paper.html)

    Author: Wenxuan Guo
    Affiliation: THU, 南洋理工
    3d 视觉定位（与文本有关），提出了 text-guided pruning (TGP) and completion-based addition (CBA)，以高效的方式深度融合3D场景表示和文本特征

23. [Motion Prompting: Controlling Video Generation with Motion Trajectories](https://openaccess.thecvf.com/content/CVPR2025/html/Geng_Motion_Prompting_Controlling_Video_Generation_with_Motion_Trajectories_CVPR_2025_paper.html)

    Author: Daniel Geng
    Affiliation: Google DeepMind ，University of Michigan ，Brown University

    主要通过分析运动轨迹来生成视频，即”与图像交互“

24. [Efficient Depth Estimation for Unstable Stereo Camera Systems on AR Glasses](https://openaccess.thecvf.com/content/CVPR2025/html/Liu_Efficient_Depth_Estimation_for_Unstable_Stereo_Camera_Systems_on_AR_CVPR_2025_paper.html)

    Author: Yongfan Liu
    Affiliation: University of California, Irvine

    应用于VR眼镜，降低推理延迟

25. [DynScene: Scalable Generation of Dynamic Robotic Manipulation Scenes for Embodied AI
    DynScene：为具身 AI 可扩展生成动态机器人纵场景](https://openaccess.thecvf.com/content/CVPR2025/html/Lee_DynScene_Scalable_Generation_of_Dynamic_Robotic_Manipulation_Scenes_for_Embodied_CVPR_2025_paper.html)

    Author: Sangmin Lee
    Affiliation: Soongsil University

    提出了一个diffusion-based framework (DynScene) 直接从文本指令生成动态操作场景，从单个静态配置生成多个多样化的轨迹，实现生成速度更快，准确度更高

26. [Janus: Decoupling Visual Encoding for Unified Multimodal Understanding and Generation
    Janus：解耦视觉编码以实现统一的多模态理解和生成](https://openaccess.thecvf.com/content/CVPR2025/html/Wu_Janus_Decoupling_Visual_Encoding_for_Unified_Multimodal_Understanding_and_Generation_CVPR_2025_paper.html)

    Author: Chengyue Wu
    Affiliation: DeepSeek-AI

    > we decouple visual encoding into separate pathways, while still leveraging a single, unified
    > transformer architecture for processing. The decoupling not only alleviates the conflict between the visual encoder’s roles in understanding and generation, but also enhances the framework’s flexibility

    得先学习视觉编码后再仔细看

27. [DrVideo: Document Retrieval Based Long Video Understanding
    DrVideo：基于文档检索的长视频理解](https://openaccess.thecvf.com/content/CVPR2025/html/Ma_DrVideo_Document_Retrieval_Based_Long_Video_Understanding_CVPR_2025_paper.html)

    Author: Ziyu Ma
    Affiliation: 湖南大学		Data Science & AI Department, Faculty of IT, Monash University

    把长视频理解转换为长文档理解任务，同样，得看看这种方法的缺陷（我觉得这个用于概括长视频应该没问题，但如果检索视频中的信息或知识，可能会遗漏）

28. [PhysicsGen: Can Generative Models Learn from Images to Predict Complex Physical Relations?
    PhysicsGen：生成模型能否从图像中学习来预测复杂的物理关系？](https://openaccess.thecvf.com/content/CVPR2025/html/Spitznagel_PhysicsGen_Can_Generative_Models_Learn_from_Images_to_Predict_Complex_CVPR_2025_paper.html)

    Author: Martin Spitznagel
    Affiliation: IMLA, Offenburg University	Herrenknecht AG 	Mannheim University

    主要是提出问题，分析问题，但生成的结果显示出再物理正确性方面有很大局限性

    > i) are generative models able to learn complex physical relations from input-output image pairs? 
    >
    > ii) what speedups can be achieved by replacing differential equation based simulations? 

29. [WiLoR: End-to-end 3D Hand Localization and Reconstruction in-the-wild
    WiLoR：端到端的 3D 手部定位和野外重建](https://openaccess.thecvf.com/content/CVPR2025/html/Potamias_WiLoR_End-to-end_3D_Hand_Localization_and_Reconstruction_in-the-wild_CVPR_2025_paper.html)

    Author: Rolandos Alexandros Potamias
    Affiliation: Imperial College London	Shanghai Jiao Tong University

    从单目视频中实现3D手部跟踪，使用a real-time fully convolutional hand localization and a high-fidelity transformer-based 3D hand reconstruction model. 

30. [Mamba as a Bridge: Where Vision Foundation Models Meet Vision Language Models for Domain-Generalized Semantic Segmentation
    Mamba 作为桥梁：视觉基础模型与视觉语言模型相遇，实现领域广义语义分割](https://openaccess.thecvf.com/content/CVPR2025/html/Zhang_Mamba_as_a_Bridge_Where_Vision_Foundation_Models_Meet_Vision_CVPR_2025_paper.html)

    Author: Xin Zhang
    Affiliation: National University of Singapore 	ASUS Intelligent Cloud Services

    如题，基于Mamba框架结合VFMs,VLMs ，需要有基本知识后再来读这篇文章

31. [Masked Scene Modeling: Narrowing the Gap Between Supervised and Self-Supervised Learning in 3D Scene Understanding
    掩蔽场景建模：缩小 3D 场景理解中监督学习和自监督学习之间的差距](https://openaccess.thecvf.com/content/CVPR2025/html/Hermosilla_Masked_Scene_Modeling_Narrowing_the_Gap_Between_Supervised_and_Self-Supervised_CVPR_2025_paper.html)

    Author: Pedro Hermosilla	Christian Stippel	Leon Sick
    Affiliation: TU Wien	Ulm University

    扩展自监督方法在3D场景中的运用

    > our model is trained natively in 3D with a novel self-supervised approach based on a Masked Scene Modeling objective, which reconstructs deep features of masked patches in a bottom-up manner and is specifically tailored to hierarchical 3D models. 

32. ==[EEE-Bench: A Comprehensive Multimodal Electrical And Electronics Engineering Benchmark
    EEE-Bench：全面的多模态电气和电子工程基准](https://openaccess.thecvf.com/content/CVPR2025/html/Li_EEE-Bench_A_Comprehensive_Multimodal_Electrical_And_Electronics_Engineering_Benchmark_CVPR_2025_paper.html)==

    Author: Ming Li1
    Affiliation: University of Tokyo

    这个是我想要研究的方向之一，目前LLMs,LMMs，在电子电路中的理解还很有限，这篇论文解释了LMMs的局限性，这个要仔细看一看

33. ==[Thinking in Space: How Multimodal Large Language Models See, Remember, and Recall Spaces
    空间思考：多模态大语言模型如何查看、记忆和回忆空间](https://openaccess.thecvf.com/content/CVPR2025/html/Yang_Thinking_in_Space_How_Multimodal_Large_Language_Models_See_Remember_CVPR_2025_paper.html)==

    Author: Jihan Yang
    Affiliation: 纽约、耶鲁、斯坦福

    探究MLLMs的视觉空间智能，同样是感兴趣的方向，要仔细看

34. [CADCrafter: Generating Computer-Aided Design Models from Unconstrained Images
    CADCrafter：从无约束图像生成计算机辅助设计模型](https://openaccess.thecvf.com/content/CVPR2025/html/Chen_CADCrafter_Generating_Computer-Aided_Design_Models_from_Unconstrained_Images_CVPR_2025_paper.html)

    Author: Cheng Chen
    Affiliation: 南洋理工

    这个其实挺有意思，用计算机视觉去辅助建模，要看看如何实现

35. [Lifting Motion to the 3D World via 2D Diffusion
    通过 2D 扩散将运动提升到 3D 世界](https://openaccess.thecvf.com/content/CVPR2025/html/Li_Lifting_Motion_to_the_3D_World_via_2D_Diffusion_CVPR_2025_paper.html)

    Author: Jiaman Li
    Affiliation: 斯坦福

    思路挺好，但是这种2D的姿态图像要如何生成，还是说以及有相应的数据集？这张图上显示了2D-3D效果很好，但是需要看看2D图像的来源。

    ![CV10](/images/CV10.png)

36. ==[M-LLM Based Video Frame Selection for Efficient Video Understanding
    基于 M-LLM 的视频帧选择，实现高效的视频理解](https://openaccess.thecvf.com/content/CVPR2025/html/Hu_M-LLM_Based_Video_Frame_Selection_for_Efficient_Video_Understanding_CVPR_2025_paper.html)==

    Author: Kai Hu
    Affiliation: Carnegie Mellon University 	University of Central Florida	Amazon

    长视频采样策略，是感兴趣的方向

    > In order to train the proposed frame selector, we introduce two supervision signals 
    >
    > (i) Spatial signal, where single frame importance score by prompting an M-LLM;
    >
    > (ii) Temporal signal, in which multiple frames selection by prompting Large Language Model (LLM) using the captions of all frame candidates.

37. ==[Do Computer Vision Foundation Models Learn the Low-level Characteristics of the Human Visual System?
    计算机视觉基础模型是否学习人类视觉系统的低级特征？](https://openaccess.thecvf.com/content/CVPR2025/html/Cai_Do_Computer_Vision_Foundation_Models_Learn_the_Low-level_Characteristics_of_CVPR_2025_paper.html)==

    Author: Yancheng Cai, Fei Yin, Dounia Hammou, Rafal Mantiuk
    Affiliation: 剑桥

    这是一个很好的问题，要仔细看看，之前问过智能感知老师关于垃圾分类的问题，当时老师给我一个解释是：如果人眼识别不出这个垃圾是什么（指可能被污渍遮挡后看不清），那计算机就无法识别。这个解释我觉得有一定道理，但同时也疑惑，人眼干不了计算机视觉就真的干不了吗？也许我举的这个例子和这篇文章关系不大，但对于底层的人眼视觉和计算机视觉的差异确实是需要研究的，看了文章的conclusion, 计算机视觉也许能突破人类视觉的瓶颈，但同时，它也会有自己的瓶颈。

    > Our findings suggest that human vision and computer vision may take both similar and different paths when learning to interpret images of the real world. Overall, while differences remain, foundation models trained on vision tasks start to align with low-level human vision, with DINOv2 showing the closest resemblance.

38. ==[From Multimodal LLMs to Generalist Embodied Agents: Methods and Lessons
    从多模态LLMs到通才具身智能体：方法和经验教训](https://openaccess.thecvf.com/content/CVPR2025/html/Szot_From_Multimodal_LLMs_to_Generalist_Embodied_Agents_Methods_and_Lessons_CVPR_2025_paper.html)==

    Author: Andrew Szot
    Affiliation: Apple	Georgia Tech

    > Specifically, our focus lies in areas such as Embodied AI, Games, UI Control, and Planning

    范围挺大的，目的在于拓展MLLM的应用领域，有时间看看

39. [On the Consistency of Video Large Language Models in Temporal Comprehension
    关于视频大语言模型在时间理解中的一致性](https://openaccess.thecvf.com/content/CVPR2025/html/Jung_On_the_Consistency_of_Video_Large_Language_Models_in_Temporal_CVPR_2025_paper.html)

    Author: Minjoon Jung
    Affiliation: National University of Singapore	Seoul National University

    长视频中的事件与时间关联对齐，增强时间理解能力

40. [Inst3D-LMM: Instance-Aware 3D Scene Understanding with Multi-modal Instruction Tuning
    Inst3D-LMM：具有多模态指令调整的实例感知 3D 场景理解](https://openaccess.thecvf.com/content/CVPR2025/html/Yu_Inst3D-LMM_Instance-Aware_3D_Scene_Understanding_with_Multi-modal_Instruction_Tuning_CVPR_2025_paper.html)

    Author: Hanxun Yu
    Affiliation: 浙大 南航

    Inst3D-LMM可以同时处理多个3D场景理解任务，捕捉对象之间复杂的pairwise spatial relationships

41. [DSPNet: Dual-vision Scene Perception for Robust 3D Question Answering
    DSPNet：用于稳健 3D 问答的双视觉场景感知](https://openaccess.thecvf.com/content/CVPR2025/html/Luo_DSPNet_Dual-vision_Scene_Perception_for_Robust_3D_Question_Answering_CVPR_2025_paper.html)

    Author: Jingzhou Luo
    Affiliation:  哈工大

    如题，双视觉场景感知，增强了3D场景理解的文本输出能力，有时间可以看看

42. [Escaping Plato's Cave: Towards the Alignment of 3D and Text Latent Spaces
    逃离柏拉图的洞穴：走向 3D 和文本潜在空间的对齐](https://openaccess.thecvf.com/content/CVPR2025/html/Hadgi_Escaping_Platos_Cave_Towards_the_Alignment_of_3D_and_Text_CVPR_2025_paper.html)

    Author: Souhail Hadgi
    Affiliation: 巴黎综合理工学院

    3D和文本之间的研究

    >  ours is the first work that helps to establish a baseline for post-training alignment of 3D uni-modal and text feature spaces, and helps to highlight both the shared and unique properties of 3D data compared to other representations.

    这个得掌握一下baseline是什么

43. [Extrapolating and Decoupling Image-to-Video Generation Models: Motion Modeling is Easier Than You Think
    外推和解耦图像到视频生成模型：运动建模比您想象的要容易](https://openaccess.thecvf.com/content/CVPR2025/html/Tian_Extrapolating_and_Decoupling_Image-to-Video_Generation_Models_Motion_Modeling_is_Easier_CVPR_2025_paper.html)

    Author: Jie Tian
    Affiliation: 华科

    解决目前生成的视频运动程度有限或表现出与文本条件冲突的不可控运动，文章中提出的separate stages还需要再了解一下

44. [Functionality Understanding and Segmentation in 3D Scenes
    3D 场景中的功能理解和分割](https://openaccess.thecvf.com/content/CVPR2025/html/Corsetti_Functionality_Understanding_and_Segmentation_in_3D_Scenes_CVPR_2025_paper.html)

    Author: Jaime Corsetti
    Affiliation: Fondazione Bruno Kessler 	University of Trento

    理解3D场景中的功能。比如任务为“打开吸顶灯”，具身智能体需要先定位电灯开关，而任务描述中没有明确提及该开关，因。因此需要一个模型来推理，识别感兴趣的对象。这里就需要对视图进行分割，理解。

45. [Learning Physics From Video: Unsupervised Physical Parameter Estimation for Continuous Dynamical Systems
    从视频中学习物理：连续动力系统的无监督物理参数估计](https://openaccess.thecvf.com/content/CVPR2025/html/Garcia_Learning_Physics_From_Video_Unsupervised_Physical_Parameter_Estimation_for_Continuous_CVPR_2025_paper.html)

    Author: Alejandro Castañeda Garcia
    Affiliation: Delft University of Technology

    提出一个无监督方法，从单个视频中估计已知连续控制方程的物理参数。对文章还需要再看看，不太理解。

46. [ECBench: Can Multi-modal Foundation Models Understand the Egocentric World? A Holistic Embodied Cognition Benchmark
    ECBench：多模态基础模型能否理解以自我为中心的世界？整体具身认知基准](https://openaccess.thecvf.com/content/CVPR2025/html/Dang_ECBench_Can_Multi-modal_Foundation_Models_Understand_the_Egocentric_World_A_CVPR_2025_paper.html)

    Author: Ronghao Dang
    Affiliation: 达摩院 浙大 同济

    提出一个评估基准（ECBench) 和一个评估系统（ECEval)，用于评估LVLMs的具身认知能力

47. [H-MoRe: Learning Human-centric Motion Representation for Action Analysis
    H-MoRe：学习以人为本的运动表示以进行动作分析](https://openaccess.thecvf.com/content/CVPR2025/html/Huang_H-MoRe_Learning_Human-centric_Motion_Representation_for_Action_Analysis_CVPR_2025_paper.html)

    Author: Zhanbo Huang
    Affiliation: Department of Computer Science and Engineering, Michigan State University

    以自监督的方式学习人体运动，以矩阵格式来表示每个身体点的绝对和相对运动

48. ==[Are Images Indistinguishable to Humans Also Indistinguishable to Classifiers?
    人类无法区分的图像是否也对分类器无法区分？](https://openaccess.thecvf.com/content/CVPR2025/html/You_Are_Images_Indistinguishable_to_Humans_Also_Indistinguishable_to_Classifiers_CVPR_2025_paper.html)==

    Author: Zebin You
    Affiliation:  人大高瓴

    这个和我上面提到的垃圾分类的例子不同。这里是指真实图像和生成图像的区分。人眼无法识别图片，那么分类器（classifiers）能否识别？可以仔细看看

49. ==[Object-Centric Prompt-Driven Vision-Language-Action Model for Robotic Manipulation
    用于机器人作的以对象为中心的提示驱动视觉-语言-动作模型](https://openaccess.thecvf.com/content/CVPR2025/html/Li_Object-Centric_Prompt-Driven_Vision-Language-Action_Model_for_Robotic_Manipulation_CVPR_2025_paper.html)==

    Author: Xiaoqi Li
    Affiliation: 北大

    在RGB图像上添加2D视觉提示，这些提示代表了所需的任务目标，例如末端执行器姿态和接触后所需的移动方向。
    这个方法确实很有创意，要仔细看看

50. [Ego4o: Egocentric Human Motion Capture and Understanding from Multi-Modal Input
    Ego4o：多模态输入的以自我为中心的人类动作捕捉和理解](https://openaccess.thecvf.com/content/CVPR2025/html/Wang_Ego4o_Egocentric_Human_Motion_Capture_and_Understanding_from_Multi-Modal_Input_CVPR_2025_paper.html)

    Author: Jian Wang
    Affiliation: MPI Informatics & Saarland Informatics Campus

    侧重于多个可穿戴设备的跟踪和理解人体运动

51. [Learning 4D Panoptic Scene Graph Generation from Rich 2D Visual Scene
    从丰富的 2D 视觉场景中学习 4D 全景场景图生成](https://openaccess.thecvf.com/content/CVPR2025/html/Wu_Learning_4D_Panoptic_Scene_Graph_Generation_from_Rich_2D_Visual_CVPR_2025_paper.html)

    Author: Shengqiong Wu
    Affiliation: National University of Singapore	Nanyang Technological University	浙大

    通过给2D视觉场景注释来增强4D场景学习，要关注如何实现这一方法。

    > Most importantly, we propose a 2D-to-4D visual scene transfer learning framework, where a spatial-temporal scene transcending strategy effectively transfers dimension-invariant features from abundant 2D SG annotations to 4Dscenes, effectively compensating for data scarcity in 4D-PSG.

52. [DaReNeRF: Direction-aware Representation for Dynamic Scenes
    DaReNeRF：动态场景的方向感知表示](https://openaccess.thecvf.com/content/CVPR2024/html/Lou_DaReNeRF_Direction-aware_Representation_for_Dynamic_Scenes_CVPR_2024_paper.html)

    Author: Ange Lou
    Affiliation: United Imaging Intelligence

    文章Abstract提到了当前方法是如何建模和渲染场景的，要补充这部分知识。

    > In response, we present a novel direction-aware representation (DaRe) approach that captures scene dynamics from six different directions.

    从六个方向来捕捉场景动态，训练时间更少，性能更强

53. [EventEgo3D: 3D Human Motion Capture from Egocentric Event Streams
    EventEgo3D：来自以自我为中心的事件流的 3D 人体动作捕捉](https://openaccess.thecvf.com/content/CVPR2024/html/Millerdurai_EventEgo3D_3D_Human_Motion_Capture_from_Egocentric_Event_Streams_CVPR_2024_paper.html)

    Author: Christen Millerdurai
    Affiliation: MPI for Informatics, SIC	Saarland University, SIC

    解决当前运动捕捉在弱光和快速运动情况下失效的问题

54. [Guess The Unseen: Dynamic 3D Scene Reconstruction from Partial 2D Glimpses
    猜看不见的事物：从部分 2D 一瞥中重建动态 3D 场景](https://openaccess.thecvf.com/content/CVPR2024/html/Lee_Guess_The_Unseen_Dynamic_3D_Scene_Reconstruction_from_Partial_2D_CVPR_2024_paper.html)

    Author: Inhee Lee
    Affiliation: Seoul National University

    在存在遮挡，图像裁剪，少样本和极其稀疏观测等示例中重建3D人体

55. [Wonder3D: Single Image to 3D using Cross-Domain Diffusion
    Wonder3D：使用跨域扩散将单张图像转换为 3D](https://openaccess.thecvf.com/content/CVPR2024/html/Long_Wonder3D_Single_Image_to_3D_using_Cross-Domain_Diffusion_CVPR_2024_paper.html)

    Author: Xiaoxiao Long
    Affiliation: The University of Hong Kong

    提高图像到3D的生成质量、一致性、效率

56. [Holodeck: Language Guided Generation of 3D Embodied AI Environments
    Holodeck：语言引导生成 3D 具身 AI 环境](https://openaccess.thecvf.com/content/CVPR2024/html/Yang_Holodeck_Language_Guided_Generation_of_3D_Embodied_AI_Environments_CVPR_2024_paper.html)

    Author: Yue Yang
    Affiliation: University of Pennsylvania

    用户输入想要获得的场景，通过LLM来获取关于场景可能是什么样的基础知识和不同对象间的空间关系约束

57. [Situational Awareness Matters in 3D Vision Language Reasoning
    态势感知在 3D 视觉语言推理中很重要](https://openaccess.thecvf.com/content/CVPR2024/html/Man_Situational_Awareness_Matters_in_3D_Vision_Language_Reasoning_CVPR_2024_paper.html)

    Author: Yunze Man
    Affiliation: University of Illinois Urbana-Champaign

    情景感知

58. ==[Eyes Wide Shut? Exploring the Visual Shortcomings of Multimodal LLMs
    睁大眼睛？探索多模态LLMs的视觉缺陷](https://openaccess.thecvf.com/content/CVPR2024/html/Tong_Eyes_Wide_Shut_Exploring_the_Visual_Shortcomings_of_Multimodal_LLMs_CVPR_2024_paper.html)==

    Author: Shengbang Tong
    Affiliation: New York University 	FAIR, Meta 	UC Berkeley

    探究LLM在视觉能力的缺陷，很重要

59. [ManipLLM: Embodied Multimodal Large Language Model for Object-Centric Robotic Manipulation
    ManipLLM：面向对象中心机器人作的具身多模态大语言模型](https://openaccess.thecvf.com/content/CVPR2024/html/Li_ManipLLM_Embodied_Multimodal_Large_Language_Model_for_Object-Centric_Robotic_Manipulation_CVPR_2024_paper.html)

    Author: Xiaoqi Li
    Affiliation: 北大

    侧重于控制机器人末端执行器

60. [TimeChat: A Time-sensitive Multimodal Large Language Model for Long Video Understanding
    TimeChat：用于长视频理解的时间敏感型多模态大语言模型](https://openaccess.thecvf.com/content/CVPR2024/html/Ren_TimeChat_A_Time-sensitive_Multimodal_Large_Language_Model_for_Long_Video_CVPR_2024_paper.html)

    Author: Shuhuai Ren
    Affiliation: 北大

    > (1) a timestamp-aware frame encoder that binds visual content with the timestamp of each frame and (2) a sliding video Q-Former that produces a video token sequence of varying lengths to accommodate videos of various durations. 

61. [MA-LMM: Memory-Augmented Large Multimodal Model for Long-Term Video Understanding
    MA-LMM：用于长期视频理解的内存增强大型多模态模型](https://openaccess.thecvf.com/content/CVPR2024/html/He_MA-LMM_Memory-Augmented_Large_Multimodal_Model_for_Long-Term_Video_Understanding_CVPR_2024_paper.html)

    Author: Bo He
    Affiliation: University of Maryland, College Park	Meta 	University of Central Florida
    以在线方式处理视频，把过去的视频信息存储在记忆库中，从而进行长期分析

62. [Unsupervised Learning of Category-Level 3D Pose from Object-Centric Videos
    从以对象为中心的视频中对类别级 3D 姿势进行无监督学习](https://openaccess.thecvf.com/content/CVPR2024/html/Sommer_Unsupervised_Learning_of_Category-Level_3D_Pose_from_Object-Centric_Videos_CVPR_2024_paper.html)

    Author: Leonhard Sommer
    Affiliation: University of Freiburg	Saarland University

    需要了解Category-Level后再来看这篇文章

63. ==[ULIP-2: Towards Scalable Multimodal Pre-training for 3D Understanding
    ULIP-2：迈向可扩展的多模态预训练以实现 3D 理解](https://openaccess.thecvf.com/content/CVPR2024/html/Xue_ULIP-2_Towards_Scalable_Multimodal_Pre-training_for_3D_Understanding_CVPR_2024_paper.html)==

    Author: Le Xue
    Affiliation:  Salesforce AI Research	Stanford University

    不需要3D注释的多模态3D学习

64. [On the Test-Time Zero-Shot Generalization of Vision-Language Models: Do We Really Need Prompt Learning?
    论视觉语言模型的测试时零样本泛化：我们真的需要提示学习吗？](https://openaccess.thecvf.com/content/CVPR2024/html/Zanella_On_the_Test-Time_Zero-Shot_Generalization_of_Vision-Language_Models_Do_We_CVPR_2024_paper.html)

    Author: Maxime Zanella	Ismail Ben Ayed
    Affiliation: UCLouvain UMons	 ́ETS Montreal

    需要有相应基础再看

65. [3D-Aware Object Goal Navigation via Simultaneous Exploration and Identification
    通过同时探索和识别实现 3D 感知对象目标导航](https://openaccess.thecvf.com/content/CVPR2023/html/Zhang_3D-Aware_Object_Goal_Navigation_via_Simultaneous_Exploration_and_Identification_CVPR_2023_paper.html)

    Author: Jiazhao Zhang
    Affiliation: 北大

    > The two sub-polices, namely corner-guided exploration policy and category-aware identification policy,，simultaneously perform by utilizing online fused 3D points as observation. 

    用于目标导航的策略设计

66. [On the Benefits of 3D Pose and Tracking for Human Action Recognition
    关于 3D 姿势和跟踪对人体动作识别的好处](https://openaccess.thecvf.com/content/CVPR2023/html/Rajasegaran_On_the_Benefits_of_3D_Pose_and_Tracking_for_Human_CVPR_2023_paper.html)

    Author: Jathushan Rajasegaran
    Affiliation: UC Berkeley	Meta AI, FAIR

    分析运动轨迹/姿态

    ![CV11](/images/CV11.png)

67. ==[3D Human Pose Estimation via Intuitive Physics
    通过直观的物理原理进行 3D 人体姿势估计](https://openaccess.thecvf.com/content/CVPR2023/html/Tripathi_3D_Human_Pose_Estimation_via_Intuitive_Physics_CVPR_2023_paper.html)==

    Author: Shashank Tripathi
    Affiliation: 普朗克研究所	荷兰阿姆斯特丹大学

    很感兴趣，通过 Center of Pressure (CoP) from the heatmap和SMPL body’s Center of Mass (CoM)来修正生成的三维人体模型

    ![CV12](/images/CV12.png)

68. [Panoptic Lifting for 3D Scene Understanding With Neural Fields
    全景提升，用于神经场的 3D 场景理解](https://openaccess.thecvf.com/content/CVPR2023/html/Siddiqui_Panoptic_Lifting_for_3D_Scene_Understanding_With_Neural_Fields_CVPR_2023_paper.html)

    Author: Yawar Siddiqui
    Affiliation: Technical University of Munich	Meta Reality Labs Zurich

    3D全景分割 ,理解

69. [Adversarial Counterfactual Visual Explanations
    对抗性反事实视觉解释](https://openaccess.thecvf.com/content/CVPR2023/html/Jeanneret_Adversarial_Counterfactual_Visual_Explanations_CVPR_2023_paper.html)

    Author: Guillaume Jeannere
    Affiliation: University of Caen Normandie, ENSICAEN, CNRS, France

    需要有相应基础再看

70. ==[NeuralField-LDM: Scene Generation With Hierarchical Latent Diffusion Models
    NeuralField-LDM：使用分层潜在扩散模型生成场景](https://openaccess.thecvf.com/content/CVPR2023/html/Kim_NeuralField-LDM_Scene_Generation_With_Hierarchical_Latent_Diffusion_Models_CVPR_2023_paper.html)==

    Author: Seung Wook Kim
    Affiliation:  NVIDIA  University of Toronto.....

    3D场景生成

    ![CV13](/images/CV13.png)

71. [TRACE: 5D Temporal Regression of Avatars With Dynamic Cameras in 3D Environments
    TRACE：3D 环境中使用动态相机对头像进行 5D 时间回归](https://openaccess.thecvf.com/content/CVPR2023/html/Sun_TRACE_5D_Temporal_Regression_of_Avatars_With_Dynamic_Cameras_in_CVPR_2023_paper.html)

    Author: Yu Sun
    Affiliation: 哈工大

    5D: space, time, and identity 推理人物在摄像机和世界坐标系中随时间变化的 3D 轨迹

    ![CV14](/images/CV14.png)

72. [VisFusion: Visibility-Aware Online 3D Scene Reconstruction From Videos
    VisFusion：从视频中重建可见性感知的在线 3D 场景](https://openaccess.thecvf.com/content/CVPR2023/html/Gao_VisFusion_Visibility-Aware_Online_3D_Scene_Reconstruction_From_Videos_CVPR_2023_paper.html)

    Author: Huiyu Gao
    Affiliation: Australian National University

    需要有相应基础再看, 文章针对单目视频的在线三维场景重建

73. [Implicit 3D Human Mesh Recovery Using Consistency With Pose and Shape From Unseen-View
    隐式 3D 人体网格恢复，使用与看不见的视图的姿势和形状的一致性](https://openaccess.thecvf.com/content/CVPR2023/html/Cho_Implicit_3D_Human_Mesh_Recovery_Using_Consistency_With_Pose_and_CVPR_2023_paper.html)

    Author: Hanbyel Cho
    Affiliation: Korea Advanced Institute of Science and Technology (KAIST), South Korea

    如题，对不同视角进行推理预测

![CV15](/images/CV15.png)

## ICCV2023


1. [AerialVLN: Vision-and-Language Navigation for UAVs
   AerialVLN：无人机的视觉和语言导航](https://openaccess.thecvf.com/content/ICCV2023/html/Liu_AerialVLN_Vision-and-Language_Navigation_for_UAVs_ICCV_2023_paper.html)

   Author: Shubo Liu
   Affiliation: Northwestern Polytechnical University	University of Adelaide

   开发了一个3D模拟器，和组里的方向契合

2. [Spatio-Temporal Domain Awareness for Multi-Agent Collaborative Perception
   用于多智能体协作感知的时空域感知](https://openaccess.thecvf.com/content/ICCV2023/html/Yang_Spatio-Temporal_Domain_Awareness_for_Multi-Agent_Collaborative_Perception_ICCV_2023_paper.html)

   Author: Kun Yang
   Affiliation: 复旦	Duke Kunshan University

   关注自动驾驶，多个智能体协同感知，也许是未来方向

3. [DeePoint: Visual Pointing Recognition and Direction Estimation
   DeePoint：视觉指向识别和方向估计](https://openaccess.thecvf.com/content/ICCV2023/html/Nakamura_DeePoint_Visual_Pointing_Recognition_and_Direction_Estimation_ICCV_2023_paper.html)

   Author: Shu Nakamura
   Affiliation: Graduate School of Informatics, Kyoto University 	RIKEN

   侧重于手指指向的分析，具体方法需要仔细阅读

4. [Context-Aware Planning and Environment-Aware Memory for Instruction Following Embodied Agents
   用于指令跟踪具身智能体的上下文感知规划和环境感知记忆](https://openaccess.thecvf.com/content/ICCV2023/html/Kim_Context-Aware_Planning_and_Environment-Aware_Memory_for_Instruction_Following_Embodied_Agents_ICCV_2023_paper.html)

   Author: Byeonghwi Kim
   Affiliation: Yonsei University	 Gwangju Institute of Science and Technology

   如题，让机器人完成一个任务后，记住新的情景/环境，然后去进行下一个任务

5. [Efficient Computation Sharing for Multi-Task Visual Scene Understanding
   高效计算共享，实现多任务视觉场景理解](https://openaccess.thecvf.com/content/ICCV2023/html/Shoouri_Efficient_Computation_Sharing_for_Multi-Task_Visual_Scene_Understanding_ICCV_2023_paper.html)

   Author: Sara Shoouri 
   Affiliation: University of Michigan

   侧重于计算效率

6. [OxfordTVG-HIC: Can Machine Make Humorous Captions from Images?
   OxfordTVG-HIC：机器可以从图像中制作幽默的标题吗？](https://openaccess.thecvf.com/content/ICCV2023/html/Li_OxfordTVG-HIC_Can_Machine_Make_Humorous_Captions_from_Images_ICCV_2023_paper.html)

   Author: Runjia Li
   Affiliation: Torr Vision Group, University of Oxford 	KAUST

   幽默生成和理解，只是觉得标题好玩。

7. [Locomotion-Action-Manipulation: Synthesizing Human-Scene Interactions in Complex 3D Environments
   运动-动作-纵：在复杂的 3D 环境中合成人与场景的交互](https://openaccess.thecvf.com/content/ICCV2023/html/Lee_Locomotion-Action-Manipulation_Synthesizing_Human-Scene_Interactions_in_Complex_3D_Environments_ICCV_2023_paper.html)

   Author: Jiye Lee	Hanbyul Joo
   Affiliation:	Seoul National University

   如题，但摘要中对方法的解释我有点不懂，后面可以仔细看看文章

8. [Objects Do Not Disappear: Video Object Detection by Single-Frame Object Location Anticipation
   物体不会消失：通过单帧物体位置预测进行视频物体检测](https://openaccess.thecvf.com/content/ICCV2023/html/Liu_Objects_Do_Not_Disappear_Video_Object_Detection_by_Single-Frame_Object_ICCV_2023_paper.html)

   Author: Xin Liu
   Affiliation: Computer Vision Lab, Delft University of Technology	Institute for Biodiversity and Ecosystem Dynamics, University of Amsterdam

   从静态关键帧预测未来物体位置，我觉得思路没问题，但是这种方法是否会有缺陷？（关注采样的策略）

9. [==PEANUT: Predicting and Navigating to Unseen Targets==
   ==PEANUT：预测和导航到看不见的目标==](https://openaccess.thecvf.com/content/ICCV2023/html/Zhai_PEANUT_Predicting_and_Navigating_to_Unseen_Targets_ICCV_2023_paper.html)

   Author: Albert J. Zhai, Shenlong Wang
   Affiliation: University of Illinois at Urbana-Champaign

   ![CV6](/images/CV6.png)

   很有前景，但文章具体实现方法需要仔细分析

10. [ActFormer: A GAN-based Transformer towards General Action-Conditioned 3D Human Motion Generation
     ActFormer：基于 GAN 的变压器，用于通用动作条件的 3D 人体运动生成](https://openaccess.thecvf.com/content/ICCV2023/html/Xu_ActFormer_A_GAN-based_Transformer_towards_General_Action-Conditioned_3D_Human_Motion_ICCV_2023_paper.html)

      Author: Liang Xu
      Affiliation: ....

    运动生成，包含单人运动与多人运动

11. [DG-Recon: Depth-Guided Neural 3D Scene Reconstruction
      DG-Recon：深度引导神经 3D 场景重建](https://openaccess.thecvf.com/content/ICCV2023/html/Ju_DG-Recon_Depth-Guided_Neural_3D_Scene_Reconstruction_ICCV_2023_paper.html)

       Author: Jihong Ju
       Affiliation: XR Labs, Qualcomm Technologies, Inc

     有点没看懂，有时间再看看（主要是一堆名词需要了解一下）

12. [SLAN: Self-Locator Aided Network for Vision-Language Understanding
      SLAN：用于视觉语言理解的自我定位辅助网络](https://openaccess.thecvf.com/content/ICCV2023/html/Zhai_SLAN_Self-Locator_Aided_Network_for_Vision-Language_Understanding_ICCV_2023_paper.html)

     Author: Jiang-Tian Zhai
     Affiliation: VCIP, CS, Nankai University 	Tencent Youtu Lab

     有点没看懂，有时间再看看

13. [PoseFix: Correcting 3D Human Poses with Natural Language
      PoseFix：使用自然语言校正 3D 人体姿势](https://openaccess.thecvf.com/content/ICCV2023/html/Delmas_PoseFix_Correcting_3D_Human_Poses_with_Natural_Language_ICCV_2023_paper.html)

       Author: Ginger Delmas
       Affiliation:  Institut de Robotica i Informatica Industrial, CSIC-UPC, Barcelona, Spain	NAVER LABS Europe

     用自然语言纠正3D人体姿态/源姿态需要如何修改才能获得目标姿态

14. ==[SINC: Spatial Composition of 3D Human Motions for Simultaneous Action Generation
      SINC：用于同时生成动作的 3D 人体动作的空间构成](https://openaccess.thecvf.com/content/ICCV2023/html/Athanasiou_SINC_Spatial_Composition_of_3D_Human_Motions_for_Simultaneous_Action_ICCV_2023_paper.html)==

       Author: Nikos Athanasiou
       Affiliation: Max Planck Institute for Intelligent Systems, T ̈ubingen, Germany	LIGM,  ́Ecole des Ponts, Univ Gustave Eiffel, CNRS, France

     通过文本来合成3D人体运动，关注如何同时实现两个/多个动作，这个挺有前景的

    ![CV7](/images/CV7.png)

15. [Text2Video-Zero: Text-to-Image Diffusion Models are Zero-Shot Video Generators
      Text2Video-Zero：文本到图像扩散模型是零样本视频生成器](https://openaccess.thecvf.com/content/ICCV2023/html/Khachatryan_Text2Video-Zero_Text-to-Image_Diffusion_Models_are_Zero-Shot_Video_Generators_ICCV_2023_paper.html)

       Author: Levon Khachatryan	
       Affiliation: Picsart AI Resarch (PAIR) 	UT Austin 	SHI Labs @ Georgia Tech, Oregon & UIUC

> In this paper, we introduce a new task, zeroshot text-to-video generation, and propose a low-cost approach (without any training or optimization) by leveraging the power of existing text-to-image synthesis methods (e.g. Stable Diffusion), making them suitable for the video domain

需要关注这个方法具有的缺点，也许是一个有很大潜力的方法

## ECCV2024


1. ==[ Physics-Based Interaction with 3D Objects via Video Generation
   通过视频生成与 3D 对象进行基于物理的交互](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/270_ECCV_2024_paper.php)==

   Author: Tianyuan Zhang
   Affiliation: MIT	斯坦福	哥伦比亚大学	康奈尔

   物理交互，很神奇，但难度很大

   ![CV8](/images/CV8.png)

2. [ SLEDGE: Synthesizing Driving Environments with Generative Models and Rule-Based Traffic
     SLEDGE：使用生成模型和基于规则的交通综合驾驶环境](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/490_ECCV_2024_paper.php)

     Author: Kashyap Chitta
     Affiliation: University of Tübingen

   自动驾驶

3. [ nuCraft: Crafting High Resolution 3D Semantic Occupancy for Unified 3D Scene Understanding
     nuCraft：制作高分辨率 3D 语义占用以实现统一的 3D 场景理解](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/730_ECCV_2024_paper.php)

     Author: Benjin Zhu
     Affiliation: MMLab, The Chinese University of Hong Kong

   3D场景理解，解决高分辨率占据预测的高内存成本问题

4. [ QUAR-VLA: Vision-Language-Action Model for Quadruped Robots
     QUAR-VLA：四足机器人的视觉-语言-动作模型](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/808_ECCV_2024_paper.php)

     Author: Pengxiang Ding
     Affiliation: 浙大

   设计了一个框架，融合感知、规划、决策

5. ==[ ScanReason: Empowering 3D Visual Grounding with Reasoning Capabilities
   ScanReason：通过推理功能增强 3D 视觉基础](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/1267_ECCV_2024_paper.php)==

   Author: Chenming Zhu
   Affiliation: The University of Hong Kong	Shanghai AI Laboratory

   从隐式指令中推断人类意图

6. [ Large Motion Model for Unified Multi-Modal Motion Generation
     用于统一多模态运动生成的大运动模型](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/2125_ECCV_2024_paper.php)

     Author: Mingyuan Zhang
     Affiliation: S-Lab, Nanyang Technological University, Singapore	SenseTime Research, China

   运动生成	

   > the objective of this work is to build a unified yet versatile foundation model for human motion generation, leveraging resources from a wide range of applications and achieving strong performance across the board.

   还是挺困难的，需要仔细看看

7. [ PoseSOR: Human Pose Can Guide Our Attention
     PoseSOR：人体姿势可以引导我们的注意力](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/2792_ECCV_2024_paper.php)

     Author: Huankang Guan
     Affiliation: Department of Computer Science, City University of Hong Kong

   人体姿态感知，并且将姿态知识作为方向性线索，来预测人类注意力将转向何处

8. [ Goldfish: Vision-Language Understanding of Arbitrarily Long Videos
   金鱼：任意长视频的视觉语言理解](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/4213_ECCV_2024_paper.php)

   Author: Kirolos Ataallah
   Affiliation: King Abdullah University of Science and Technology	Harvard University	The Swiss AI Lab IDSIA, USI, SUPSI

   这个方法有时间得仔细看看

9. [ VLAD-BuFF: Burst-aware Fast Feature Aggregation for Visual Place Recognition
     VLAD-BuFF：用于视觉位置识别的突发感知快速特征聚合](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/6086_ECCV_2024_paper.php)

    Author: Ahmad Khaliq
    Affiliation: Queensland University of Technology, Australia

     Visual Place Recognition 通过分析图像来识别其在世界中的位置和环境的能力

     可以再看看这篇论文

10. [ Real-time Holistic Robot Pose Estimation with Unknown States
     未知状态的实时整体机器人姿态估计](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/6496_ECCV_2024_paper.php)

       Author: Shikun Ban
       Affiliation: 北大

     不需要知道机器人内部状态（我觉得是指关节角度，内部结构设计等）来进行机器人姿态估计，应该会应用与多机器人协作

11. [ AvatarPose: Avatar-guided 3D Pose Estimation of Close Human Interaction from Sparse Multi-view Videos
      AvatarPose：从稀疏多视图视频中对近距离人类互动进行化身引导的 3D 姿势估计](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/6979_ECCV_2024_paper.php)

     Author: Feichi Lu
     Affiliation: Department of Computer Science, ETH Zürich, Switzerland. 
        	     Max Planck Institute for Intelligent Systems, Germany
      如题，侧重于人体近距离交互时的姿态识别

12. [ Improving Vision and Language Concepts Understanding with Multimodal Counterfactual Samples
      使用多模态反事实样本提高视觉和语言概念理解](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/8703_ECCV_2024_paper.php)

     Author: Chengen Lai
     Affiliation: 西电

      > we create a synthetic multimodal counterfactual dataset (COCO-CF)
      > and propose a novel contrastive learning framework (COMO).

      提供一个数据集，通过对比来让模型学习

13. [ Frontier-enhanced Topological Memory with Improved Exploration Awareness for Embodied Visual Navigation
      前沿增强拓扑记忆，提高具身视觉导航探索意识](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/8905_ECCV_2024_paper.php)

    Author: Xinru Cui
    Affiliation: 上交
      a novel graph memory structure for navigation
      ![CV9](/images/CV9.png)

14. [ DeTra: A Unified Model for Object Detection and Trajectory Forecasting
      DeTra：用于目标检测和轨迹预测的统一模型](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/12207_ECCV_2024_paper.php)
    Author: Sergio Casas
    Affiliation：Waabi, University of Toronto
      侧重于自动驾驶，使用激光雷达和高精度地图




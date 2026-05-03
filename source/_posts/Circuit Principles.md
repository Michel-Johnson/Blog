---
title: Circuit Principles
date: 2025-09-09 12:58:08
mathjax: true
categories:
- Notes
tags:
- Circuit
description: This is a note for "Circuit Principles" by Professor Yu Xinjie of Tsinghua University.
---


[电路原理-清华大学-于歆杰（第一部分-前39讲）](https://www.acfun.cn/v/ac26233238_1)
[电路原理-清华大学-于歆杰（第二部分-后51讲）](https://www.acfun.cn/v/ac26347776)

# Circuit Principles

**Arithmetic** : calculation of numbers 
**Algebra** : use variables and functions to represent numbers 
**Calculus** : the accumulated effect and the rate of change of variables

## Circuits:

1. Source (generator , photovoltaic(pv) cell,mic...)   [ˌfəʊtəʊvɒlˈteɪɪk]
2. Load (motor , speaker, screen...)
3. Energy or/and  signal processing circuits (transformer, filter , amplifier...)
4. Switch and line (circuit board, transmission line)

How to regard circuits?

Load  	1.Resistive 	2.Dynamic  ---> Interesting period [ 1. Transient	2.Steady state]

Source	1.DC	2.AC  [1.sine	2.periodical]

## Model

1. Ideal circuit elements

   Actual circuit element ---by abstracting---> simple *u-i* relationship
   Basic ideal circuit elements (two terminal) :	

   resistor	inductor	capacitor	source

2. Circuit modeling

## Classification

1. Linear and nonlinear

   Linear elements: linear relationship of stimulations and its corresponding response

   Linear circuits: all loads are linear , expressed by linear equations

   Nonlinear circuits : one of more loads are nonlinear , expressed by nonlinear equations

2. Planar and non-planar

   Planar circuits can be draw on a plane without any intersection of elements

   Non-planar circuit will always have intersections

## Variables

1.Current
Time variance rate of charges
Unit: A (ampere)	
Direct Current	Alternating Current
Ideal dc current	Sinusoidal ac current

2.Voltage
The work provided by electric field force while moving unit positive charge
Unit: V (Volt)

3.Potential
The voltage from some point to the reference point
The potential of the reference point is ZERO
Symbol: $\varphi $ (or U)	Unit: V(Volt)

The voltage between two points = the difference of the potential of these two points

4.Electromotive force
The work provided by non-electric field force while moving unit positive charge
eBA=UAB

5.Capital and small letter for variables

- Capital for constant variables 	--U, I
- Small for changeable variables	--u, i

## Reference direction

Associated reference directions / Non-associated reference directions

## Power

## Resistors

**Resistance** : The opposition of a body or substance to current passing through it, resulting in a change of electrical energy into heat or another form of energy
**Resistor** : A device used to control current in an electric circuit by providing resistance
**Conductance** : G=1/R	i=Gu	Unit : S(Siemens)

Resistors always absorb power, regardless of the reference direction.

## Independent sources

**Ideal independent voltage source** :
a. The voltage of $u_s$ is independent of other elements.
b. The current of $u_s$​ is determined by outer circuits.

How about short?

**Ideal independent current source**:
a. The current of $i_s$ is independent of other elements.
b. The voltage of $i_s$ is determined by outer circuits.

How about open?

## Port

Two terminals constitute a port if they satisfy the following condition:
The current flowing into one terminal equals to the flowing out of the other.
Two-terminal element are one-port.

Passive sign convention / associated reference direction
Active sign convention / non-associated reference direction

## Dependent / controlled elements

1. Controlled resistors
   An example of controlled resistor: switch
   Another example of controlled resistor : MOSFET

2. Dependent sources

   (1)  Voltage: They have the properties of voltage sources whose voltages are controlled by other voltages or currents in the circuit
   (a) Linear Current Controlled Voltage Source (CCVS)
   (b) Linear Voltage Controlled Voltage Source (VCVS)

   (2)Current~~

   VCCS/CCCS

## Kirchhoff's Laws

1. Terms

   (1) A **branch** is constituted by the end to end connection of several elements without any divarication.
   (2) A **node** is the connecting point of 3 or more branches.
   (3) A **path** is the branch(es) between two nodes.
   (4) A **loop** is the close path constituted by branches
   (5) A **mesh** is the loop which has no intersections with other branches in the planar circuits.

2. Kirchhoff's Current Laws (KCL)
   The algebra sum of the currents flowing out of any node is ZERO.
   The algebra sum of the currents flowing into any node is ZERO.

3. KVL
   The algebra sum of the voltage drop through any loop is ZERO

   Generalized KVL : The voltage between any two points in the circuit equals to the algebra sum of the voltages through any path between these two points.

## 2b method

b branch
2b equation
b current
b voltage

we can list 	b independent element constraints, 
			  n-1 independent KCLs 
			  b-n+1 independent KVLs

1. Serial Connection : the connections without bifurcation
2. Parallel Connection : the connections with common nodes

## Balanced Bridge

Any resistor between the equipotential points has no effect on branch variables.

![Bridge1](/images/Bridge1.png)

![Bridge2](/images/Bridge2.png)

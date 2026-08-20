# 00 — Autoridad y método de trabajo

**Producto:** Sergod Store Web V1  
**Estado:** CURRENT — única autoridad normativa  
**Consolidación:** 2026-08-19

## 1. Propósito

CURRENT define de forma completa el producto Sergod Store Web V1, sus reglas de negocio, límites arquitectónicos, UX, datos, calidad, despliegue y release.

## 2. Regla de autoridad

Para requisitos funcionales, comerciales, de UX, arquitectura objetivo, alcance y despliegue, la única fuente normativa es `docs/CURRENT/`.

El código, contratos, tests y persistencia sirven para determinar el estado técnico real. Una capacidad solo pertenece a V1 cuando está explícitamente respaldada por CURRENT.

## 3. Jerarquía

1. Instrucción expresa actual del propietario.
2. `docs/CURRENT/` como conjunto coherente.
3. `AGENTS.md` para disciplina de ejecución.
4. Stage temporal actual de `.codex-mission/`.
5. Skills específicas de Sergod.
6. Skills de terceros.
7. Código, contratos, tests y persistencia como evidencia técnica.

## 4. Árbol objetivo vs. estado real

`01-ARBOL-FUNCIONAL-V1.md` representa el objetivo final. `IMPLEMENTATION-STATUS.md` registra el estado verificado de implementación y debe actualizarse con evidencia.

## 5. Método obligatorio por cambio

1. verificar Git y entorno;
2. localizar únicamente el contexto técnico necesario;
3. inspeccionar contratos, código, persistencia y tests afectados;
4. implementar el cambio mínimo que satisface CURRENT;
5. actualizar pruebas;
6. ejecutar gates proporcionales y los gates completos exigidos por el stage;
7. revisar seguridad, regresiones y diff;
8. actualizar estado documental cuando corresponda;
9. crear un commit recuperable;
10. cerrar el stage solo cuando sus criterios se cumplan.

## 6. Alcance cerrado

No se inventan capacidades, módulos, entidades, roles, workflows ni integraciones que CURRENT no enumere. Si falta una decisión comercial indispensable, se registra el bloqueo y se continúa con trabajo independiente.

## 7. Evolución de CURRENT

CURRENT no se modifica para acomodar una implementación. Un cambio normativo requiere una instrucción explícita del propietario y debe quedar reflejado coherentemente en los documentos afectados.

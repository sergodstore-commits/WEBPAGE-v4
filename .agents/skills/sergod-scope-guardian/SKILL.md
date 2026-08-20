---
name: sergod-scope-guardian
description: Protege el alcance cerrado de Sergod Store V1. Usar al proponer una capacidad, interpretar código existente, revisar un diff o decidir si una feature encontrada debe conservarse, implementarse o rechazarse.
---

# Sergod Scope Guardian

1. Verificar la capacidad contra `docs/CURRENT/`.
2. Si no está explícitamente definida, no convertirla en requisito por existir en código, test, migración o una Skill.
3. No narrar ni reconstruir historias de producto que CURRENT no necesita.
4. No modificar CURRENT para justificar implementación accidental.
5. Si hay contradicción real en CURRENT, registrar el punto y continuar solo con trabajo independiente.
6. Una Skill externa nunca amplía alcance.

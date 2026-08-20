## Purpose

Permite a dos personas en la misma moto (piloto y copiloto) emparejar sus móviles con
un código efímero y mantener una llamada de voz continua entre ambos mientras dura el
trayecto, sin depender de ningún hardware de intercomunicador.

## ADDED Requirements

### Requirement: Emparejamiento por código de sala efímero
El sistema SHALL permitir a un usuario generar un código de sala de un solo uso y a
otro usuario unirse a esa sala introduciendo o escaneando ese código, sin necesidad de
cuenta ni registro previo.

#### Scenario: Generar código de sala
- **WHEN** un usuario abre la pantalla de emparejamiento y elige crear una sala
- **THEN** el sistema muestra un código y/o QR único, listo para compartir con el
  segundo usuario

#### Scenario: Unirse con un código válido
- **WHEN** un usuario introduce o escanea un código de sala que sigue activo y sin un
  segundo participante ya conectado
- **THEN** ambos usuarios quedan emparejados y el sistema inicia el establecimiento de
  la llamada

#### Scenario: Código inválido o caducado
- **WHEN** un usuario introduce un código que no existe o ha caducado
- **THEN** el sistema informa de que el código no es válido y ofrece generar uno nuevo,
  sin iniciar ninguna llamada

#### Scenario: Sala ya ocupada
- **WHEN** un usuario intenta unirse a una sala que ya tiene dos participantes
  conectados
- **THEN** el sistema rechaza la unión e informa de que la sala ya está en uso

### Requirement: Llamada de voz directa entre los dos móviles
Una vez emparejados, el sistema SHALL establecer una llamada de voz continua
directamente entre los dos móviles, sin que el audio pase por ningún servidor
intermedio.

#### Scenario: Llamada establecida con éxito
- **WHEN** los dos móviles completan el emparejamiento y ambos conceden permiso de
  micrófono
- **THEN** la llamada de voz queda activa y cada usuario oye al otro en tiempo real

#### Scenario: Permiso de micrófono denegado
- **WHEN** un usuario deniega el permiso de micrófono al intentar entrar en llamada
- **THEN** el sistema muestra que no puede iniciar la llamada por falta de permiso y
  explica cómo concederlo, sin dejar la app en un estado de carga indefinido
  <!-- Verificación manual: comportamiento real de permisos en Android -->

#### Scenario: No se puede establecer conexión directa por restricciones de red
- **WHEN** el emparejamiento se completa pero las redes de ambos móviles impiden
  establecer la conexión de audio directa entre ellos
- **THEN** el sistema informa de que no se ha podido completar la llamada, sin dejar la
  interfaz en un estado de carga indefinido

#### Scenario: Cualquiera de los dos puede colgar
- **WHEN** un usuario en llamada activa pulsa colgar
- **THEN** la llamada termina para ambos usuarios y cada app vuelve a la pantalla de
  emparejamiento

#### Scenario: Llamada continúa con la app en segundo plano
- **WHEN** un usuario minimiza la app o bloquea la pantalla mientras la llamada está
  activa
- **THEN** la llamada de voz sigue activa y con audio audible
  <!-- Verificación manual: comportamiento real en dispositivo Android -->

### Requirement: Selección de la mejor red disponible
Al iniciar una llamada, el sistema SHALL usar la conexión de datos de mejor calidad
disponible en ese momento, en el orden WiFi, 5G, 4G, 3G.

#### Scenario: Varias conexiones disponibles
- **WHEN** el dispositivo tiene más de un tipo de conexión disponible al iniciar la
  llamada (por ejemplo WiFi y 4G)
- **THEN** el sistema usa la de mayor calidad según el orden WiFi > 5G > 4G > 3G

#### Scenario: Sin ninguna conexión de datos disponible
- **WHEN** un usuario intenta iniciar o unirse a una llamada sin ninguna conexión de
  datos activa
- **THEN** el sistema informa de que no hay conexión disponible y no intenta
  establecer la llamada

### Requirement: Reconexión automática ante pérdida de conexión
Si la conexión de red falla durante una llamada activa, el sistema SHALL intentar
reconectar automáticamente sin que el usuario tenga que volver a emparejar ni colgar
manualmente.

#### Scenario: Corte de red breve durante la llamada
- **WHEN** la conexión de red se pierde durante una llamada activa y vuelve a estar
  disponible poco después
- **THEN** el sistema reconecta automáticamente y la llamada continúa sin que el
  usuario tenga que repetir el emparejamiento

#### Scenario: Estado visible durante la reconexión
- **WHEN** el sistema está intentando reconectar tras una pérdida de red
- **THEN** la interfaz muestra claramente que está reconectando, distinto del estado
  "en llamada" normal

#### Scenario: El otro participante cuelga o pierde la conexión de forma definitiva
- **WHEN** el otro participante termina la llamada o su reconexión no tiene éxito tras
  un tiempo prolongado
- **THEN** la llamada termina también en este lado y se vuelve a la pantalla de
  emparejamiento con un mensaje explicando el motivo

### Requirement: Disponibilidad del servicio de señalización
El sistema SHALL informar claramente al usuario cuando el servicio de señalización no
esté disponible, sin dejar la interfaz en un estado de carga indefinido.

#### Scenario: Servidor de señalización no disponible al crear o unirse a una sala
- **WHEN** un usuario intenta crear o unirse a una sala y el servicio de señalización
  no responde
- **THEN** el sistema informa de que no se ha podido conectar con el servicio y ofrece
  reintentar

# Generador de suplencias — Apps Script

Aplicación web conectada a la hoja **Copia de Generador de Sustituciones**:

<https://docs.google.com/spreadsheets/d/1UaNLLEtzU-fTOA8boGkJwAk7hCQUsgo5NieB8mel_iY/edit>

## Qué incluye

- Acceso exclusivo mediante cuentas corporativas `@escuelassj.com`.
- Lectura de docentes y espacios desde la pestaña `Datos`.
- Lectura de franjas horarias desde `Horario`.
- Registro de suplencias en `Eventos` respetando sus 22 columnas.
- Detección de conflictos para una misma persona, fecha y hora.
- Envío opcional del aviso mediante Gmail.
- Creación opcional del evento en Google Calendar.
- Eliminación del registro y de su evento asociado.
- Alta de docentes y espacios desde la propia aplicación.
- Diseño adaptable a ordenador, tableta y móvil.
- Identidad visual corporativa de Jesuitas Valencia, con el logotipo y los colores azul `#009DC2` y gris `#424642`.

## Instalación

La instalación debe realizarse desde una cuenta del centro terminada en `@escuelassj.com`.

1. Abre la hoja de cálculo con la cuenta corporativa.
2. En la hoja, entra en **Extensiones → Apps Script**.
3. Sustituye el contenido de `Código.gs` por el contenido de `Code.gs` de este paquete.
4. Crea un archivo HTML llamado exactamente `Index` y pega el contenido de `Index.html`.
5. En **Configuración del proyecto**, activa **Mostrar el archivo de manifiesto `appsscript.json` en el editor**.
6. Abre `appsscript.json` y sustituye su contenido por el archivo incluido en este paquete.
7. Guarda el proyecto y llámalo, por ejemplo, **Generador de suplencias**.

El logo ya está incrustado dentro de `Index.html`: no hay que subir imágenes ni modificar colores. El archivo `logo-jesuitas-valencia.png` se incluye únicamente como copia de referencia.

Antes de publicar, selecciona la función `runSelfCheck` en la barra superior y pulsa **Ejecutar**. La función solo comprueba el dominio, las pestañas y las listas; no modifica la hoja ni envía correos. Debe finalizar sin errores.

El identificador de la hoja ya está configurado en `Code.gs`. Si se copia la hoja y cambia su identificador, hay que modificar:

```javascript
SPREADSHEET_ID: '1UaNLLEtzU-fTOA8boGkJwAk7hCQUsgo5NieB8mel_iY'
```

## Publicación y obtención del enlace

1. En Apps Script, pulsa **Implementar → Nueva implementación**.
2. En **Seleccionar tipo**, elige **Aplicación web**.
3. En **Ejecutar como**, selecciona **Usuario que accede a la aplicación web**.
4. En **Quién tiene acceso**, selecciona la opción limitada a la organización o al dominio de Escuelas San José.
5. Pulsa **Implementar** y acepta los permisos solicitados.
6. Copia la URL terminada en `/exec`. Ese es el enlace que se puede compartir.

No publiques la aplicación como **Cualquier usuario**. La disponibilidad de la opción limitada al dominio depende de la configuración establecida por el administrador de Google Workspace.

### Permisos de la hoja

Como la aplicación se ejecuta con la identidad de quien accede, las personas autorizadas necesitan permiso de edición en la hoja para registrar suplencias. Se puede compartir la hoja con un grupo corporativo formado únicamente por quienes gestionan las suplencias.

## Control de acceso adicional

Además de la restricción de Google Workspace, el servidor comprueba que la cuenta termine en `@escuelassj.com`.

Si solo deben entrar determinadas personas del dominio, edita esta parte de `Code.gs`:

```javascript
ALLOWED_EMAILS: [
  'direccion.primaria@escuelassj.com',
  'otra.persona@escuelassj.com'
],
```

Si la lista se deja vacía, puede entrar cualquier cuenta del dominio a la que Google Workspace haya concedido acceso a la aplicación.

## Gmail y Calendar

Las casillas **Enviar aviso mediante Gmail** y **Añadir evento a Google Calendar** están desactivadas inicialmente. Solo se ejecutan cuando la persona usuaria las marca y guarda la suplencia.

- El correo se envía desde la cuenta corporativa que utiliza la aplicación.
- El evento se crea en su calendario predeterminado.
- Para usar un calendario compartido, escribe su identificador en `Eventos!B1`, junto a `ID Calendario`.

La primera vez que se use cada función, Google puede solicitar autorización.

## Estructura esperada de la hoja

La aplicación utiliza estas pestañas, respetando los nombres exactos:

- `Eventos`
- `Datos`
- `Horario`
- `Plantilla correo` — se conserva, aunque el mensaje se genera ya desde la aplicación.

La hoja original contiene actualmente un único docente con correo. El resto se puede incorporar en `Datos` o mediante **Configurar → Añadir docente** dentro de la aplicación.

## Actualizaciones

Cuando se modifique el código:

1. Guarda los cambios.
2. Entra en **Implementar → Gestionar implementaciones**.
3. Edita la implementación existente.
4. Selecciona **Nueva versión** y vuelve a implementar.

De esta forma se conserva el mismo enlace `/exec`.


# MCP Client - WhatsApp Integration

Este proyecto integra el cliente **MCP (Model Context Protocol)** con **WhatsApp** para crear una experiencia interactiva con inteligencia artificial usando el modelo **Claude-3** de Anthropic. Los usuarios pueden realizar consultas y recibir respuestas generadas por la IA, con la capacidad de interactuar con servidores MCP para mejorar las respuestas.

## Requisitos

1. **Node.js**: Se recomienda tener instalada la versión 18 o superior.
2. **Python**: Se requiere Python 3.x para ejecutar el script del servidor MCP.
3. **Cuenta de Anthropic**: Necesitarás una clave de API de Anthropic para usar el modelo de IA.
4. **Instalar dependencias**:
   ```bash
   npm install
   ```

## Configuración

1. **Clave de API de Anthropic**:
   Debes configurar tu clave de API de Anthropic en las variables de entorno. Agrega lo siguiente a tu archivo `.env`:

   ```
   ANTHROPIC_API_KEY=tu_clave_de_api_aqui
   ```

2. **Credenciales de WhatsApp**:
   Se utiliza la librería [Baileys](https://github.com/adiwajshing/Baileys) para interactuar con WhatsApp. Las credenciales se guardarán en el directorio `./auth_info` cuando se inicie por primera vez.

3. **Script del servidor MCP**:
   El cliente MCP necesita un script de servidor que puede ser en Python o JavaScript. Este script se pasará como argumento al iniciar el sistema.

## Uso

Para ejecutar la aplicación, sigue estos pasos:

1. Asegúrate de tener un servidor MCP ejecutándose. Este servidor debe estar accesible desde tu cliente.

2. Ejecuta el cliente con el siguiente comando:

   ```bash
   node index.js <ruta_servidor_mcp>
   ```

   Por ejemplo:

   ```bash
   node index.js ./path/to/your/mcp_server_script.js
   ```

   El sistema se conectará al servidor MCP y a WhatsApp, y podrás comenzar a recibir y enviar mensajes a través de WhatsApp.

3. Cuando el cliente se conecte, se mostrará un código QR en la consola. Escanea el código QR con WhatsApp para autenticar el número.

## Flujo de la Aplicación

1. El cliente MCP conecta con el servidor MCP y obtiene las herramientas disponibles.
2. Cuando se recibe un mensaje en WhatsApp, el sistema lo procesa y responde utilizando el modelo Claude-3 de Anthropic.
3. Si la consulta requiere el uso de herramientas adicionales, estas se ejecutan.


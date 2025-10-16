import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Setup Swagger UI documentation
 */
export const setupSwagger = (app: Express) => {
  try {
    // Load OpenAPI spec from YAML file
    const swaggerYamlPath = join(__dirname, 'swagger.yaml');
    const swaggerYaml = readFileSync(swaggerYamlPath, 'utf8');
    const swaggerDocument = yaml.parse(swaggerYaml);

    // Swagger UI options
    const swaggerUiOptions = {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Plex Exporter API Documentation',
      customfavIcon: '',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
      },
    };

    // Serve Swagger UI
    app.use('/api/docs', swaggerUi.serve);
    app.get('/api/docs', swaggerUi.setup(swaggerDocument, swaggerUiOptions));

    // Serve raw OpenAPI spec as JSON
    app.get('/api/docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(swaggerDocument, null, 2));
    });

    console.log('✅ Swagger documentation available at /api/docs');
  } catch (error) {
    console.error('❌ Failed to setup Swagger documentation:', error);
  }
};

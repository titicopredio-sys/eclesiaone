/* =============================================================================
   Eclesia One — configuração do endereço da API
   -----------------------------------------------------------------------------
   Para rodar com o servidor no PRÓPRIO endereço (npm start, Docker, VPS):
   deixe VAZIO — é o modo padrão, funciona sem ajuste.

   Para hospedar a INTERFACE em serviço estático (Firebase Hosting, Netlify,
   S3/CloudFront) e a API em outro servidor, informe o endereço da API:

     window.ECLESIA_API_BASE = 'https://api.suaigreja.org';

   O servidor responde com os cabeçalhos CORS necessários. O endereço da API
   é uma decisão sua: qualquer hospedagem que rode Node 22.5+ serve.

   ECLESIA_STATIC_DEMO é ligado automaticamente pelo build de demonstração
   (npm run build:static): a interface funciona sem servidor, com o retrato de
   dados em /api-snapshot.json, somente leitura.
   ========================================================================== */
window.ECLESIA_API_BASE = '';
window.ECLESIA_STATIC_DEMO = window.ECLESIA_STATIC_DEMO || false;

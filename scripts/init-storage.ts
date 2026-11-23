import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

async function main() {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) {
    console.log("Sem S3_ENDPOINT, pulando inicialização de storage.");
    return;
  }
  const bucket = process.env.S3_BUCKET ?? "pos-saas";
  const s3 = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    },
  });

  console.log(`Conectando ao MinIO/S3 em ${endpoint} para verificar bucket '${bucket}'...`);
  
  // Tenta conectar por até 30 segundos enquanto o MinIO inicia
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`Bucket '${bucket}' já existe e está pronto.`);
      return;
    } catch (err: unknown) {
      const error = err as { $metadata?: { httpStatusCode?: number }; name?: string; message?: string };
      const status = error?.$metadata?.httpStatusCode;
      const name = error?.name;
      
      if (status === 404 || name === "NotFound" || name === "NoSuchBucket") {
        console.log(`Criando bucket '${bucket}'...`);
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`Bucket '${bucket}' criado com sucesso.`);
        return;
      }
      
      console.log(`Tentativa ${attempt}/15: aguardando MinIO ficar pronto (${error?.message || name || "iniciando"})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

main().catch((err) => {
  console.warn("Aviso na inicialização do storage:", err);
  // Não trava a inicialização se for apenas timeout no storage
});

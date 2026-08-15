import os
import logging
import uuid
import base64
import hashlib
from fastapi import FastAPI, HTTPException, Request
from typing import Dict, Any
from cryptography.fernet import Fernet
from pymongo import AsyncMongoClient
from pydantic import BaseModel
from kubernetes import client, config
from kubernetes.client.rest import ApiException

# from middleware import AuthMiddleware

app = FastAPI()
# app.add_middleware(AuthMiddleware)

# Kubernetes API Client setup
if "KUBERNETES_SERVICE_HOST" in os.environ:
    config.load_incluster_config()
else:
    config.load_kube_config()

k8s_api_client = client.ApiClient()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_HOST = os.environ.get('MONGO_HOST')
MONGO_USER = os.environ.get('MONGO_USER')
MONGO_PASSWORD = os.environ.get('MONGO_PASSWORD')

# Derive a valid Fernet key (32 url-safe base64-encoded bytes) from
# APP_SECRET_KEY, which is a shared hex string and not Fernet-compatible as-is.
ENCRYPTION_KEY = base64.urlsafe_b64encode(
    hashlib.sha256(os.environ["APP_SECRET_KEY"].encode()).digest()
)
cipher = Fernet(ENCRYPTION_KEY)

@app.on_event('startup')
async def startup_event():
    logging.info("Starting RAG Ingest Service")
    org_db = AsyncMongoClient(f'mongodb+srv://{MONGO_USER}:{MONGO_PASSWORD}@{MONGO_HOST}').orgs
    app.orgs = org_db.orgs

@app.get('/healthz')
async def healthz():
    return {"status": "ok"}

def decrypt_api_key(token: str) -> str:
    return cipher.decrypt(token.encode()).decode()


@app.post("/rag/ingest")
async def scrape_urls(request: Request):
    data = await request.json()
    urls = data.get("urls")
    org_id = data.get("org_id")
    lab_id = data.get("lab_id")
    if not urls or not isinstance(urls, list) or not org_id:
        raise HTTPException(status_code=400, detail="Invalid input data")
    
    org = await app.orgs.find_one({"org_id": org_id})
    llm_configs: Dict[str, Any] = org.get("llm_configs", {}) or {}
    provider = llm_configs.get("provider")
    model = llm_configs.get("model")

    # Encrypted key may be under 'api_key'
    enc_key = llm_configs.get("api_key")
    logger.info(f"Using provider {provider} and model {model} for org {org_id}")
    if not enc_key:
        raise HTTPException(status_code=400, detail="LLM API key not configured for org")
    try:
        api_key = decrypt_api_key(enc_key)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to decrypt org LLM API key")
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    random_hash = uuid.uuid4().hex[:8]
    namespace = "default"
    configmap_name = f"scraper-configmap-{random_hash}"
    job_name = f"scraper-job-{random_hash}"

    
    # ConfigMap data: write URLs as a file-like structure
    configmap_data = {}
    filename = 'file'
    file_count = 0
    for url in urls:
        file_count += 1
        configmap_data[filename + str(file_count)] = url

    try:
        # Create ConfigMap
        core_v1 = client.CoreV1Api()
        configmap = client.V1ConfigMap(
            api_version="v1",
            kind="ConfigMap",
            metadata=client.V1ObjectMeta(name=configmap_name, namespace=namespace),
            data=configmap_data
        )
        try:
            core_v1.create_namespaced_config_map(namespace=namespace, body=configmap)
            logging.info(f"ConfigMap '{configmap_name}' created.")
        except ApiException as e:
            if e.status == 409:  # ConfigMap already exists
                logging.warning(f"ConfigMap '{configmap_name}' already exists, updating it.")
                core_v1.replace_namespaced_config_map(name=configmap_name, namespace=namespace, body=configmap)
            else:
                raise e

        # Define the Kubernetes Job using the scraper image (pipelines handle vectorize+store)
        create_single_job_with_configmap(
            job_name=job_name,
            namespace=namespace,
            configmap_name=configmap_name,
            image="jdvincent/lab-thingy-scraper:latest",
            api_key=api_key,
            org_id=org_id,
            lab_id=lab_id,
        )
        return {"message": f"Job '{job_name}' successfully created."}
    except ApiException as e:
        logging.error(f"Error interacting with Kubernetes: {e}")
        raise HTTPException(status_code=500, detail="Failed to create resources in Kubernetes")


def create_single_job_with_configmap(
    job_name: str,
    namespace: str,
    configmap_name: str,
    image: str,
    api_key: str,
    org_id: str | None = None,
    lab_id: str | None = None,
):
    # core_v1 = client.CoreV1Api()
    batch_v1 = client.BatchV1Api()

    # Define the single container (scraper: scrape -> vectorize -> store via pipelines)
    container = client.V1Container(
        name="scraper",
        image=image,
        image_pull_policy="Always",
        env=[
            # Inject the decrypted API key directly as an environment variable
            # (the previous SecretKeyRef used the secret value as the key name, which is invalid)
            client.V1EnvVar(
                name="OPENAI_API_KEY",
                value=api_key,
            ),
            # IDs to tag and scope the job
            client.V1EnvVar(
                name="ORG_ID",
                value=org_id or "",
            ),
            client.V1EnvVar(
                name="LAB_ID",
                value=lab_id or "",
            ),
            # Pass Mongo connection details directly as env vars
            client.V1EnvVar(
                name="MONGO_HOST",
                value=MONGO_HOST or "",
            ),
            client.V1EnvVar(
                name="MONGO_USER",
                value=MONGO_USER or "",
            ),
            client.V1EnvVar(
                name="MONGO_PASSWORD",
                value=MONGO_PASSWORD or "",
            ),
        ],
        volume_mounts=[
            client.V1VolumeMount(name="config-volume", mount_path="/mnt/config"),
        ],
    )

    # Define volumes
    config_volume = client.V1Volume(
        name="config-volume",
        config_map=client.V1ConfigMapVolumeSource(name=configmap_name),
    )

    # Pod template
    template = client.V1PodTemplateSpec(
        metadata=client.V1ObjectMeta(labels={"job-name": job_name}),
        spec=client.V1PodSpec(
            restart_policy="Never",
            containers=[container],
            volumes=[config_volume],
        ),
    )

    # Job spec with TTL to auto-clean finished jobs (in seconds)
    job_spec = client.V1JobSpec(
        template=template,
        backoff_limit=4,
        ttl_seconds_after_finished=600,  # cleanup 10 minutes after completion
    )

    # Job definition
    job = client.V1Job(
        api_version="batch/v1",
        kind="Job",
        metadata=client.V1ObjectMeta(name=job_name),
        spec=job_spec,
    )

    # Create the job
    try:
        batch_v1.create_namespaced_job(namespace=namespace, body=job)
        logging.info(f"Job '{job_name}' created successfully.")
    except ApiException as e:
        logging.error(f"Failed to create Job: {e}")
        raise


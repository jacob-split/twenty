# Deploying Twenty to Google Cloud Platform (GCP)

This guide details how to deploy Twenty CRM to GCP using App Engine, Cloud SQL, and Cloud Memorystore.

## Prerequisites

1.  **Google Cloud Project**: Create a new project in the [GCP Console](https://console.cloud.google.com/).
2.  **GCloud CLI**: Install and authenticate (`gcloud auth login`, `gcloud config set project YOUR_PROJECT_ID`).
3.  **APIs Enabled**:
    *   App Engine Admin API
    *   Cloud SQL Admin API
    *   Cloud Memorystore for Redis API

## Infrastructure Setup

### 1. Database (Cloud SQL)
Create a PostgreSQL 16 instance.
*   **Region**: Same as your App Engine region.
*   **Networking**: Enable "Private IP" if you want secure VPC access, but for App Engine Standard, Public IP with Cloud SQL Auth Proxy or simply allowing App Engine is easier to start.
*   **Connection Name**: Note down the `project:region:instance` string.
*   **Database**: Create a database named `default` (or your preference).
*   **User**: Create a user and password.

### 2. Cache (Cloud Memorystore)
Create a Redis instance.
*   **Region**: Same as App Engine.
*   **Tier**: Basic (for dev) or Standard (for prod).
*   **Network**: Your default VPC.
*   **IP**: Note the IP address and port.
*   **VPC Connector**: App Engine Standard environment requires a **Serverless VPC Access Connector** to talk to internal IPs (Redis, Private Cloud SQL).
    *   Go to VPC Network > Serverless VPC access.
    *   Create a connector in your region.
    *   Adding `vpc_access_connector` to your `app.yaml` will be required if using private IPs.

### 3. Storage (Cloud Storage)
Twenty uses S3-compatible storage. We will use GCS with S3 Interoperability.
1.  Create a GCS Bucket.
2.  Go to GCS Settings > Interoperability.
3.  Click "Create a key" for your Service Account (or user).
4.  Note the **Access Key** and **Secret**.

## Configuration

Edit the following files with your secrets and connection strings before deploying (DO NOT COMMIT SECRETS TO GIT):

*   `packages/twenty-server/app.yaml`
*   `packages/twenty-server/worker.yaml`

**Key Env Config:**
*   `STORAGE_S3_ENDPOINT`: `https://storage.googleapis.com`
*   `STORAGE_S3_REGION`: `auto`

## Deployment

Run the automated deployment script:

```bash
chmod +x tools/deploy-gcp.sh
./tools/deploy-gcp.sh
```

Or deploy manually:

1.  **Server**:
    ```bash
    cd packages/twenty-server
    gcloud app deploy app.yaml
    ```
2.  **Worker**:
    ```bash
    cd packages/twenty-server
    gcloud app deploy worker.yaml
    ```
3.  **Frontend**:
    ```bash
    cd packages/twenty-front
    gcloud app deploy app.yaml
    ```
4.  **Website**:
    ```bash
    cd packages/twenty-website
    gcloud app deploy app.yaml
    ```
5.  **Docs**:
    ```bash
    cd packages/twenty-docs
    gcloud app deploy app.yaml
    ```

## Agentic AI Metadata
The `deploy-gcp.sh` script automatically copies the root `metadata` folder into `packages/twenty-server/metadata` before deployment. This ensures the Server service has access to the AI configuration at runtime.

# raziel - The Keeper of Secrets

Raziel is a NodeJS web application for hosting versioned files through a REST
API. Files are automatically versioned and can be arbitrarily tagged, like git.
Files are stored at arbitrary paths and can be protected by API keys. Files
operate on a first-come-first-owner basis. The first user to upload a file at
a specific location determines the API key required to modify the file. Once a file
has been uploaded, the API key cannot change and it cannot be added to a
previously unprotected file.

API keys can be either automatically generated or specified. API keys that are
specified do not have to meet any requirements.

Trees allow for loose-form directories around uploaded files.

REST API documentation is available on Apiary: http://docs.raziel.apiary.io/.

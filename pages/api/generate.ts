// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
const YAML = require('yamljs');
const $RefParser = require('@apidevtools/json-schema-ref-parser');

async function resolveRefs(obj) {
    const resolved = await $RefParser.dereference(obj);
    return resolved;
}

async function parseSwaggerYaml(yaml) {
    const parseYaml = YAML.parse(yaml);
    const swaggerDoc = await resolveRefs(parseYaml) as any;
    const paths = Object.keys(swaggerDoc.paths);
    const result = [];

    for (const path of paths) {
        const methods = Object.keys(swaggerDoc.paths[path]);

        for (const method of methods) {
            const operation = swaggerDoc.paths[path][method];
            const params = operation.parameters || [];
            const requestBody = operation.requestBody;

            let schema = {};
            if (requestBody && requestBody.content && requestBody.content['application/json']) {
                const requestBodySchema = requestBody.content['application/json'].schema;
                if (requestBodySchema) {
                    schema = await resolveRefs(requestBodySchema)
                }
            }

            let queryParams = [];
            if (method.toUpperCase() === 'GET' && params.length > 0) {
                queryParams = params.map(param => {
                    let schema = param.schema;
                    if (schema && schema.$ref) {
                        schema =  $RefParser.dereference(schema, (err, schema) => {
                            if(err){
                                console.log(err)
                            }
                            return schema
                        });
                    }
                    return {
                        name: param.name,
                        schema: schema || {},
                        required: param.required || false,
                    };
                });
            }

            result.push({
                url: path,
                method: method.toUpperCase(),
                operationId: operation.operationId,
                requestBody: schema,
                responses: operation.responses,
                tags: operation.tags,
                queryParams,
            });
        }
    }

    return result;
}


export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const response = await fetch(req.query.filePath.toString())
    const blob = await response.blob()
    const text = await blob.text();
    const result =  await parseSwaggerYaml(text)

    res.status(200).send(result)
}
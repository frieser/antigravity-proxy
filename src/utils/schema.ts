const UNSUPPORTED_SCHEMA_FIELDS = new Set([
  "additionalProperties",
  "$schema",
  "$id",
  "$comment",
  "$ref",
  "$defs",
  "definitions",
  "const",
  "contentMediaType",
  "contentEncoding",
  "if",
  "then",
  "else",
  "not",
  "patternProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "dependentRequired",
  "dependentSchemas",
  "propertyNames",
  "minContains",
  "maxContains",
]);

export function cleanJSONSchemaForAntigravity(schema: any, aggressive: boolean = false): any {
  if (schema === true) {
    return { type: "STRING" };
  }
  if (schema === false) {
    return { type: "NULL" };
  }
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }

  if (schema.anyOf || schema.oneOf) {
    const options = schema.anyOf || schema.oneOf;
    const bestOption = options.find((opt: any) => opt.type === "object") || options[0];
    return cleanJSONSchemaForAntigravity(bestOption, aggressive);
  }

  const result: any = {};
  
  // Collect all property names for required validation (like plugin)
  const propertyNames = new Set<string>();
  if (schema.properties && typeof schema.properties === "object") {
    for (const propName of Object.keys(schema.properties)) {
      propertyNames.add(propName);
    }
  }

  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_SCHEMA_FIELDS.has(key)) {
      continue;
    }

    if (key === "type" && typeof value === "string") {
      result[key] = value.toUpperCase();
    } else if (key === "properties" && typeof value === "object" && value !== null) {
      const props: Record<string, any> = {};
      const entries = Object.entries(value);
      if (entries.length > 0) {
        for (const [propName, propSchema] of entries) {
          props[propName] = cleanJSONSchemaForAntigravity(propSchema, aggressive);
        }
        result[key] = props;
      } else {
        // Technical placeholder for empty properties (matching proxy's previous logic but better)
        result[key] = {
           _placeholder: { 
             type: "BOOLEAN", 
             description: "Technical placeholder to ensure non-empty schema" 
           }
        };
      }
    } else if (key === "items" && typeof value === "object") {
      result[key] = cleanJSONSchemaForAntigravity(value, aggressive);
    } else if (key === "required" && Array.isArray(value)) {
      if (propertyNames.size > 0) {
        const validRequired = value.filter((prop) => typeof prop === "string" && propertyNames.has(prop));
        if (validRequired.length > 0) {
          result[key] = validRequired;
        }
      } else if (result.properties?._placeholder) {
        result[key] = ["_placeholder"];
      }
    } else if (key === "description" && !aggressive) {
      result[key] = value;
    } else if (key === "enum" || key === "format" || key === "default" || key === "examples") {
      result[key] = value;
    }
  }

  // Ensure array schemas have an 'items' field (Issue #80 in plugin)
  if (result.type === "ARRAY" && !result.items) {
    result.items = { type: "STRING" };
  }

  // Final fallback if no type was set
  if (!result.type && schema.properties) {
    result.type = "OBJECT";
  }

  return result;
}

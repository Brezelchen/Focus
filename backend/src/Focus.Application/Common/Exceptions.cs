namespace Focus.Application.Common;

public sealed class NotFoundException(string entity, object key)
    : Exception($"{entity} '{key}' was not found.");

public sealed class ValidationException(string message) : Exception(message);

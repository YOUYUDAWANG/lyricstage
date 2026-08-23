import {
  directorBYOKDiagnosticsFromErrorV1,
  type DirectorBYOKConfigurationV1,
} from "@lyricstage/performance";

export const sanitizedRollingReason = (error: unknown, configuration: DirectorBYOKConfigurationV1): string => {
  void configuration;
  const diagnosticsValue = directorBYOKDiagnosticsFromErrorV1(error);
  const last = diagnosticsValue?.attempts.at(-1);
  const message = error instanceof Error ? error.message : "";
  if (last?.outcome === "contract-degraded") {
    const contractReasons = [...message.matchAll(/:contract:([a-z0-9-]{1,120})/giu)];
    const contractReason = contractReasons.at(-1)?.[1]?.toLowerCase();
    return `rolling-provider-contract-degraded${contractReason ? `-${contractReason}` : ""}`;
  }
  if (last?.outcome === "parse-error") {
    const suffix = last.status ? `-http-${last.status}` : "";
    if (/供应商没有返回有效 JSON/u.test(message)) return `rolling-provider-envelope-json-invalid-${last.responseShape ?? "unknown"}${suffix}`;
    if (/响应缺少文本|缺少 output_text/u.test(message)) return `rolling-provider-envelope-text-missing${suffix}`;
    if (/模型没有返回 JSON 对象/u.test(message)) return `rolling-provider-output-json-invalid${suffix}`;
  }
  if (last) return `rolling-provider-${last.outcome}${last.status ? `-http-${last.status}` : ""}`;
  return /budget|预算|上限|超时/u.test(message)
    ? "rolling-provider-budget"
    : "rolling-provider-error";
};

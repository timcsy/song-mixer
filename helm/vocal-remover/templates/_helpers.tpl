{{/*
Expand the name of the chart.
*/}}
{{- define "vocal-remover.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "vocal-remover.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "vocal-remover.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "vocal-remover.labels" -}}
helm.sh/chart: {{ include "vocal-remover.chart" . }}
{{ include "vocal-remover.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "vocal-remover.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vocal-remover.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Redis URL
*/}}
{{- define "vocal-remover.redisUrl" -}}
redis://{{ include "vocal-remover.fullname" . }}-redis:6379/0
{{- end }}

{{/*
MinIO endpoint
*/}}
{{- define "vocal-remover.minioEndpoint" -}}
{{ include "vocal-remover.fullname" . }}-minio:9000
{{- end }}

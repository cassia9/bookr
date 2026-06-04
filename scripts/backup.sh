#!/bin/bash

# 每日自動備份腳本
BACKUP_DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="backups/backup_$BACKUP_DATE"

echo "📦 Creating backup: $BACKUP_DIR"

mkdir -p "$BACKUP_DIR"
cp -r src "$BACKUP_DIR/" 2>/dev/null || true
cp -r supabase "$BACKUP_DIR/" 2>/dev/null || true

git add "$BACKUP_DIR" 2>/dev/null || true
git commit -m "backup: automatic backup at $BACKUP_DATE" --quiet

echo "✅ Backup created: $BACKUP_DIR"

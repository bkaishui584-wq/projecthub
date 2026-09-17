import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8787')}"
workers = 1
threads = 8
timeout = 180
accesslog = "-"
errorlog = "-"

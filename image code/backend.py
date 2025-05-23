import yt_dlp
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import threading
import uuid

app = Flask(__name__)
CORS(app)

DOWNLOAD_FOLDER = 'C:\\Users\\pc\\Videos\\nexlify download'

if not os.path.exists(DOWNLOAD_FOLDER):
    os.makedirs(DOWNLOAD_FOLDER)

download_statuses = {}
download_progress = {}

def progress_hook(d):
    file_id = d.get('__file_id')
    if file_id:
        if d['status'] == 'downloading':
            total_bytes = d.get('total_bytes')
            downloaded_bytes = d.get('downloaded_bytes')
            if total_bytes and downloaded_bytes:
                percentage = (downloaded_bytes / total_bytes) * 100
                download_progress[file_id] = {'status': 'downloading', 'percentage': percentage}
            else:
                download_progress[file_id] = {'status': 'downloading', 'percentage': float(d.get('_percent_str', '0%').replace('%', ''))}
        elif d['status'] == 'finished':
            download_progress[file_id] = {'status': 'completed', 'percentage': 100}
        elif d['status'] == 'error':
            download_progress[file_id] = {'status': 'failed', 'error': d.get('error'), 'percentage': download_progress.get(file_id, {}).get('percentage', 0)}

def run_download_in_thread(url, download_format, resolution, unique_filename, file_id):
    output_path = DOWNLOAD_FOLDER
    download_progress[file_id] = {'status': 'pending', 'percentage': 0}

    try:
        ydl_opts = {
            'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
            'noplaylist': True,
            'retries': 3,
            'progress_hooks': [progress_hook],
            '__file_id': file_id,
            'writedescription': False,
            'writeinfojson': False,
            'writesubtitles': False,
            'writeautomaticsub': False,
            'cookiesfile': 'cookies.txt',
            'postprocessors': [],
            'merge_output_format': 'mp4',
            'int_filters': True,
            'external_downloader': 'aria2c',
            'external_downloader_args': ['-x', '16', '-s', '16', '-k', '1M'],
        }

        if download_format == 'mp3':
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'].append({
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            })
            ydl_opts['outtmpl'] = os.path.join(output_path, '%(title)s.mp3')

        elif download_format == 'mp4':
            resolution_map = {'480p': 480, '720p': 720, '1080p': 1080, '2k': 1440, '4k': 2160}
            target_height = resolution_map.get(resolution.lower(), None) if resolution else None

            if target_height:
                ydl_opts['format'] = f'bestvideo[ext=mp4][vcodec^=avc1][height<={target_height}]+bestaudio[ext=m4a]/best'
            else:
                ydl_opts['format'] = 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best'

            ydl_opts['postprocessors'].append({
                'key': 'FFmpegVideoConvertor',
                'preferedformat': 'mp4'
            })

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(url, download=True)

            title = info_dict.get('title', 'unknown')
            final_filepath = info_dict.get('_filename') or info_dict.get('requested_downloads', [{}])[0].get('filepath')

            if not final_filepath or not os.path.exists(final_filepath):
                raise Exception("Could not determine final filename after download.")

            final_filename = os.path.basename(final_filepath)

        download_statuses[file_id] = {
            "status": "completed",
            "filename": final_filename,
            "title": title
        }
        download_progress[file_id].update({
            'status': 'completed',
            'filename': final_filename,
            'title': title
        })

    except yt_dlp.utils.DownloadError as e:
        error_message = str(e)
        download_statuses[file_id] = {"status": "failed", "error": error_message}
        download_progress[file_id]['status'] = 'failed'
        download_progress[file_id]['error'] = error_message
        print(f"Download failed for {url} (ID: {file_id}): {error_message}")
    except Exception as e:
        error_message = f"An unexpected error occurred: {str(e)}"
        download_statuses[file_id] = {"status": "failed", "error": error_message}
        download_progress[file_id]['status'] = 'failed'
        download_progress[file_id]['error'] = error_message
        print(f"Download failed for {url} (ID: {file_id}): {error_message}")

@app.route('/download', methods=['POST'])
def handle_download_request():
    data = request.get_json()
    if not isinstance(data, list):
        data = [data]

    MAX_CONCURRENT_DOWNLOADS = 10
    if len(data) > MAX_CONCURRENT_DOWNLOADS:
        return jsonify({"error": f"Cannot process more than {MAX_CONCURRENT_DOWNLOADS} downloads at once."}), 400

    file_ids = []
    for item in data:
        url = item.get('url')
        download_format = item.get('format', 'mp4')
        resolution = item.get('resolution')

        if not url:
            return jsonify({"error": "One or more URLs are missing."}), 400

        file_id = str(uuid.uuid4())
        unique_filename = f"{file_id}"
        download_statuses[file_id] = {"status": "pending"}
        file_ids.append(file_id)

        thread = threading.Thread(target=run_download_in_thread,
                                  args=(url, download_format, resolution, unique_filename, file_id))
        thread.start()

    return jsonify({"message": f"Initiated download of {len(data)} item(s).", "file_ids": file_ids}), 202

@app.route('/status/<file_id>', methods=['GET'])
def get_download_status(file_id):
    status_info = download_progress.get(file_id)
    if status_info:
        if status_info['status'] in ['completed', 'failed']:
            final_details = download_statuses.get(file_id, {})
            status_info['filename'] = final_details.get('filename')
            status_info['title'] = final_details.get('title')
            status_info['error'] = final_details.get('error')
        return jsonify(status_info)
    elif file_id in download_statuses:
        return jsonify(download_statuses[file_id])
    return jsonify({"error": "Download not found"}), 404

@app.route('/files/<file_id>', methods=['GET'])
def get_downloaded_file(file_id):
    status_info = download_statuses.get(file_id)
    if status_info and status_info['status'] == 'completed':
        filename = status_info['filename']
        filepath = os.path.join(DOWNLOAD_FOLDER, filename)
        if os.path.exists(filepath):
            mimetype = 'audio/mpeg' if filename.endswith('.mp3') else 'video/mp4'
            return send_file(filepath, as_attachment=True, mimetype=mimetype)
        else:
            return jsonify({"error": "File not found on server"}), 404
    return jsonify({"error": "Download not complete or not found"}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)


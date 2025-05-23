
# Universal Video Downloader Bot
#
# This bot uses the 'yt-dlp' library to download videos from various online platforms.
#
# IMPORTANT:
# 1. You MUST install the yt-dlp library: pip install yt-dlp
# 2. This script requires an active internet connection.
# 3. Download capabilities depend on yt-dlp's support for the given URL's platform.
# 4. Respect copyright and terms of service of the platforms you download from.
#    Use this tool responsibly and only for content you have the right to download.
# 5. FFmpeg MUST be installed and in your system's PATH for merging video/audio
#    and for converting audio to MP3.

import yt_dlp
import os
import sys
import threading

class VideoDownloaderBot:
    def __init__(self):
        print("Video Downloader Bot initialized. Ready to download videos.")

    def download_single_video(self, url: str, output_path: str = "downloads/", format_choice: str = 'mp4', resolution_choice: str = None):
        """Downloads a single video with specified format and resolution."""
        if not url:
            print("Error: No URL provided for download.")
            return

        if not os.path.exists(output_path):
            os.makedirs(output_path)
            print(f"Created output directory: {output_path}")

        ydl_opts = {
            'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
            'noplaylist': True,
            'retries': 5,
            'progress_hooks': [self.download_progress_hook],
        }

        if format_choice == 'mp3':
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}]
            ydl_opts['outtmpl'] = os.path.join(output_path, '%(title)s.mp3')
            print(f"Preparing to download audio as MP3 from: {url}")
        else: # MP4
            if resolution_choice:
                resolution_map = {'480p': 480, '720p': 720, '1080p': 1080, '2k': 1440, '4k': 2160}
                target_height = resolution_map.get(resolution_choice.lower())
                if target_height:
                    ydl_opts['format'] = f'bestvideo[height<={target_height}]+bestaudio/best'
                    ydl_opts['merge_output_format'] = 'mp4'
                    print(f"Preparing to download video as MP4 in {resolution_choice} from: {url}")
                else:
                    ydl_opts['format'] = 'bestvideo+bestaudio/best'
                    ydl_opts['merge_output_format'] = 'mp4'
                    print(f"Preparing to download video as MP4 (best quality) from: {url}")
            else:
                ydl_opts['format'] = 'bestvideo+bestaudio/best'
                ydl_opts['merge_output_format'] = 'mp4'
                print(f"Preparing to download video as MP4 (best quality) from: {url}")

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info_dict = ydl.extract_info(url, download=True)
                video_title = info_dict.get('title', 'Unknown Title')
                final_ext = 'mp3' if format_choice == 'mp3' else 'mp4'
                final_path = os.path.join(output_path, f"{video_title}.{final_ext}")
                print(f"\nSuccessfully downloaded: {video_title} to {os.path.abspath(final_path)}")
        except yt_dlp.utils.DownloadError as e:
            print(f"Error downloading {url}: {e}")
        except Exception as e:
            print(f"An unexpected error occurred during download of {url}: {e}")

    def download_progress_hook(self, d):
        if d['status'] == 'downloading':
            if 'total_bytes' in d and 'downloaded_bytes' in d:
                percent = (d['downloaded_bytes'] / d['total_bytes']) * 100
                print(f"Downloading: {d['filename']} - {percent:.2f}% ({d.get('eta')}s remaining)", end='\r')
            elif 'total_bytes_estimate' in d and 'downloaded_bytes' in d:
                percent = (d['downloaded_bytes'] / d['total_bytes_estimate']) * 100
                print(f"Downloading: {d['filename']} - {percent:.2f}% (estimated)", end='\r')
            else:
                print(f"Downloading: {d['filename']} - {d.get('_percent_str', 'N/A')}", end='\r')
            sys.stdout.flush()
        elif d['status'] == 'finished':
            print(f"\nFinished downloading: {d['filename']}")
        elif d['status'] == 'error':
            print(f"\nError during download: {d['filename']} - {d.get('error', 'Unknown error')}")

def main():
    downloader_bot = VideoDownloaderBot()
    print("\n--- Multiple Video Downloader Bot ---")
    print("Enter up to 10 video URLs, separated by newlines. Type 'go' to start.")
    print("Enter 'exit' or 'quit' to stop.")
    print("------------------------------------")

    urls_to_download = []
    while True:
        line = input("> ").strip()
        if line.lower() in ['exit', 'quit']:
            print("Exiting Video Downloader Bot. Goodbye!")
            break
        elif line.lower() == 'go':
            if urls_to_download:
                format_choice = input("Download as (MP4/MP3)? ").strip().lower()
                resolution_choice = None
                if format_choice == 'mp4':
                    resolution_map = {'480p': '480p', '720p': '720p', '1080p': '1080p', '2k': '2k', '4k': '4k'}
                    available_resolutions = ", ".join(resolution_map.keys())
                    while format_choice == 'mp4' and resolution_choice not in resolution_map:
                        resolution_choice = input(f"Choose resolution ({available_resolutions}, or leave blank for best): ").strip().lower()
                        if not resolution_choice:
                            break
                        elif resolution_choice not in resolution_map:
                            print(f"Invalid resolution. Choose from: {available_resolutions}.")

                threads = []
                for url in urls_to_download[:10]: # Limit to 10
                    thread = threading.Thread(target=downloader_bot.download_single_video,
                                              args=(url,),
                                              kwargs={'output_path': 'downloads/', 'format_choice': format_choice, 'resolution_choice': resolution_choice})
                    threads.append(thread)
                    thread.start()

                for thread in threads:
                    thread.join()

                print("\nAll downloads initiated have completed (or failed).")
                urls_to_download = [] # Clear the list for the next batch
            else:
                print("No URLs entered. Please enter video URLs before typing 'go'.")
        elif line:
            urls_to_download.append(line)
            print(f"Added URL. Current queue: {len(urls_to_download)} URLs.")

if __name__ == "__main__":
    main()
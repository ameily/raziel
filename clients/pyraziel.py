
from __future__ import print_function

import sys
import requests
import errno
import os
import json
import arrow


HTTP_STATUS_ERRNO = {
    400: errno.EINVAL,
    401: errno.EACCES,
    404: errno.ENOENT
}


def file_size(value):
    '''
    Get the human readable file size string from a number. This will convert a
    value of 1024 to 1Kb and 1048576 to 1Mb.

    :param int value: the value to convert
    :returns str: the human readable file size string
    '''
    value = float(value)
    units = ['Kb', 'Mb', 'Gb', 'Tb']
    unit = 'B'
    for u in units:
        v = value / 1024.0
        if v < 1.0:
            break
        value = v
        unit = u
    if unit == 'B':
        return "{} B".format(int(value))
    return "{:.2f} {}".format(value, unit)


class RazielError(Exception):

    def __init__(self, res):
        self.status_code = res.status_code

        try:
            self.error = res.json()['error']
        except:
            self.error = "http status " + str(self.status_code)

        self.errno = HTTP_STATUS_ERRNO.get(self.status_code)

    def __str__(self):
        return self.error


class RazielFile(object):

    def __init__(self, data):
        self.url = data['url']
        self.name = data['name'] or os.path.basename(self.url)
        self.version = data['version']
        self.tag = data.get('tag', None)
        self.upload_date = arrow.Arrow.fromtimestamp(data['timestamp'])

        ld = data.get('lastDownload')
        self.last_download = arrow.Arrow.fromtimestamp(ld) if ld else None
        self.downloads = data['downloads']
        self.md5 = data['md5']
        self.sha1 = data['sha1']
        self.sha256 = data['sha256']
        self.mimetype = data['mimetype']
        self.size = data['size']

        self.api_key = data.get('apiKey', None)

    def write(self, stream=None, level=None):
        stream = stream or sys.stdout
        level = level or 'full'

        if level == 'full':
            print("Path:          ", self.url, file=stream)
            print("Version:       ", self.version, file=stream)
            print("Name:          ", self.name, file=stream)

            if self.tag:
                print("Tag:           ", self.tag, file=stream)

            print("Uploaded:      ", self.upload_date.humanize(), file=stream)
            print("MD5:           ", self.md5, file=stream)
            print("SHA-1:         ", self.sha1, file=stream)
            print("SHA-256:       ", self.sha256, file=stream)
            print("Mimetype:      ", self.mimetype, file=stream)
            print("Size:          ", file_size(self.size), file=stream)
            print("Downloads:     ", self.downloads, file=stream)

            if self.last_download:
                print("Last Download: ", self.last_download.humanize(), file=stream)
        elif level == 'short':
            print("Version:       ", self.version)
            if self.tag:
                print("Tag:           ", self.tag, file=stream)
            print("Uploaded:      ", self.upload_date.humanize(), file=stream)
            print("SHA-1:         ", self.sha1, file=stream)
            print("Size:          ", file_size(self.size), file=stream)



class TreeListing(object):

    def __init__(self, items):
        self.trees = []
        self.leafs = []

        for item in items:
            if item['type'] == 'tree':
                self.trees.append(item['name'] + '/')
            elif item['type'] == 'leaf':
                self.leafs.append(item['name'])

        self.trees.sort()
        self.leafs.sort()

    def write(self, stream=None):
        stream = stream or sys.stdout
        if self.trees:
            print('\n'.join(self.trees), file=stream)
        if self.leafs:
            print('\n'.join(self.leafs), file=stream)





class RazielClient(object):

    def __init__(self, server, ssl=False):
        self.server = server
        self.ssl = ssl

        if server.startswith("http://") or server.startswith("https://"):
            self.base = server
        elif ssl:
            self.base = "https://" + server
        else:
            self.base = "http://" + server

    def _get_url(self, collection, path):
        if not path.startswith('/'):
            path = '/' + path

        return "{base}/v1/{collection}{path}".format(
            base=self.base, collection=collection, path=path
        )

    def list_tree(self, path, limit=None, skip=None):
        params = {}
        url = self._get_url('trees', path)

        if limit:
            params['limit'] = limit
        if skip:
            params['skip'] = skip

        res = requests.get(url, params=params)

        if res.status_code != 200:
            raise RazielError(res)

        tree = TreeListing([
            json.loads(line) for line in res.text.split('\n') if line.strip()
        ])

        return tree



    def list_history(self, path, limit=None, skip=None):
        url = self._get_url('history', path)
        params = {}
        if limit is not None:
            params['limit'] = limit
        if skip is not None:
            params['skip'] = skip

        res = requests.get(url, params=params)

        if res.status_code != 200:
            raise RazielError(res)

        history = [
            RazielFile(json.loads(line)) for line in res.text.split('\n')
                if line.strip()
        ]

        return history

    def download_file(self, path, dest=None, version=None, tag=None,
                      force=False):
        url = self._get_url('files', path)

        src = self.stat_file(path, version=version, tag=tag)
        params = {
            'version': src.version,
            'tag': src.tag
        }

        if dest is None:
            fp = sys.stdout.buffer
        else:
            if os.path.isdir(dest):
                dest = os.path.join(dest, src.name)

            if os.path.exists(dest) and not force:
                raise FileExistsError(dest)

            fp = open(dest, 'wb')

        res = requests.get(url, params=params, stream=True)

        for chunk in res.iter_content(0xffff):
            fp.write(chunk)

        if dest is not None:
            fp.close()
            return dest

        return None

    def stat_file(self, path, version=None, tag=None):
        url = self._get_url('files', path)
        params = {'format': 'stat'}

        if version is not None:
            params['version'] = version
        if tag is not None:
            params['tag'] = tag

        res = requests.get(url, params=params)

        if res.status_code != 200:
            raise RazielError(res)

        rf = RazielFile(res.json())

        return rf

    def upload_file(self, path, src, tag=None, api_key=None, protect=False,
                    name=None):
        url = self._get_url('files', path)
        fp = open(src, 'rb')

        body = {}

        if api_key:
            body['apiKey'] = api_key
        elif protect:
            body['protect'] = True

        if tag:
            body['tag'] = tag

        if name:
            body['name'] = name

        res = requests.post(url, data=body, files={'file': fp})

        if res.status_code != 200:
            raise RazielError(res)

        return RazielFile(res.json())

    def link_file(self, path, target, api_key=None, protect=False):
        url = self._get_url('files', path)
        params = {
            'action': 'symlink',
            'target': target.url,
            'version': target.version,
            'tag': target.tag
        }

        if api_key:
            params['apiKey'] = api_key
        elif protect:
            params['protect'] = True

        res = requests.put(url, data=params)

        if res.status_code != 200:
            raise RazielError(res)

        return RazielFile(res.json())



def run(args):
    rc = None
    client = RazielClient(args.url)

    if args.upload:
        rf = client.upload_file(args.path, args.upload, api_key=args.apikey,
                                tag=args.tag, name=args.name,
                                protect=args.protect)

        rf.write()

        if rf.api_key and args.protect:
            print("!" * 50)
            print("Generated API Key:", rf.api_key)
            print("!" * 50)

        rc = 0
    elif args.list:
        tree = client.list_tree(args.path, skip=args.skip, limit=args.limit)
        if tree:
            tree.write()
        rc = 0
    elif args.stat:
        rf = client.stat_file(args.path, version=args.version, tag=args.tag)
        if rf:
            rc = 0
            rf.write()
        else:
            rc = -1
    elif args.history:
        history = client.list_history(args.path, skip=args.skip,
                                      limit=args.limit)

        if history:
            for (i, item) in enumerate(history):
                if i > 0:
                    print()
                    print('----')
                item.write(level='short')
        rc = 0
    elif args.download:
        dest = args.download
        if dest == '-':
            dest = None

        path = client.download_file(args.path, dest=dest, tag=args.tag,
                                    version=args.version, force=args.force)
        if path:
            print("raziel: file downloaded:", path)

        rc = 0
    elif args.link:
        target = client.stat_file(args.link, tag=args.tag,
                                  version=args.version)
        rf = client.link_file(args.path, target=target, api_key=args.apikey,
                              protect=args.protect)

        rf.write()
        if rf.api_key and args.protect:
            print("!" * 50)
            print("Generated API Key:", rf.api_key)
            print("!" * 50)

    return rc



def parse_args():
    import argparse

    parser = argparse.ArgumentParser(description='raziel client')

    parser.add_argument('-k', '--apikey', metavar='KEY', action='store',
                        help="api key")
    parser.add_argument('-n', '--name', metavar='NAME',action='store',
                        help='file name')
    parser.add_argument('-t', '--tag',action='store',  metavar='TAG',
                        help='file tag')
    parser.add_argument('-v', '--version', action='store', metavar='VERSION',
                        help='specific version')
    parser.add_argument('-S', '--skip', action='store', type=int, metavar='N',
                        help='skip N entires in history/listing')
    parser.add_argument('-L', '--limit', action='store', type=int,
                        metavar='N', help='limit history/listing to N entries')
    parser.add_argument('-r', '--reverse', action='store_true',
                        help='reverse listings')
    parser.add_argument('-p', '--protect', action='store_true',
                        help='protect new upload with auto generated api key')
    parser.add_argument('-f', '--force', action='store_true',
                        help='force overwriting of files')

    parser.add_argument('-u', '--upload', action='store', metavar='PATH',
                        help='upload new file/version PATH')
    parser.add_argument('-d', '--download', action='store', metavar='PATH',
                        help='download file to path')
    parser.add_argument('-l', '--list', action='store_true', help='list tree')
    parser.add_argument('-s', '--stat', action='store_true', help='stat file')
    parser.add_argument('-x', '--link', action='store', metavar='TARGET',
                        help='link to file TARGET')
    parser.add_argument('-H', '--history', action='store_true',
                        help='list file history')

    parser.add_argument('url', help='raziel url')
    parser.add_argument('path', help='file path', nargs='?')

    args = parser.parse_args()

    if not (args.upload or args.list or args.stat or args.history
            or args.download or args.link):
        print("raziel: no command specified, must be one of -u, -l, or -s",
              file=sys.stderr)
        parser.print_help()
        sys.exit(1)

    if not args.path:
        args.path = '/'

    return args


if __name__ == '__main__':
    args = parse_args()

    try:
        rc = run(args)
    except RazielError as e:
        print("raziel: ", args.path, ": ", e, sep='', file=sys.stderr)
        rc = (-e.errno) if e.errno else -1
    except requests.exceptions.ConnectionError as e:
        print("raziel: failed to connect to server", file=sys.stderr)
        rc = -1
    except requests.exceptions.MissingSchema as e:
        print("raziel:", e, file=sys.stderr)
        rc = 1
    except requests.exceptions.Timeout:
        print("raziel: request timed out", file=sys.stderr)
        rc = -1
    except OSError as e:
        print("raziel:", e.strerror or str(e), file=sys.stderr)
        rc = -e.errno if e.errno else -1
    except IOError as e:
        if hasattr(e, 'strerror') and e.strerror:
            print("raziel:", e.strerror, file=sys.stderr)
            rc = -e.errno
        else:
            print("raziel:", e, file=sys.stderr)
            rc = -1
    except Exception as e:
        rc = -1
        print("raziel: unknown error:", e, file=sys.stderr)

    sys.exit(rc)

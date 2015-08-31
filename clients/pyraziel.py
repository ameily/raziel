
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


def normalize_url(args):
    host = args.url
    path = args.path

    if not host.startswith('http'):
        host = "http://" + host

    if host.endswith('/'):
        host = host[:-1]

    if path.startswith('/'):
        path = path[1:]

    if args.upload or args.stat or args.download:
        action = 'files'
    elif args.history:
        action = 'history'
    elif args.list:
        action = 'trees'

    url = "{host}/v1/{action}/{path}".format(
        host=host,
        action=action,
        path=path
    )

    return url



def upload_file(url, path, api_key=None, tag=None, name=None, protect=False):
    try:
        fp = open(path, 'rb')
    except OSError as e:
        print("raziel: cannot access ", path, ": ", e.strerror)
        return -e.errno

    body = {'file': fp}
    if api_key:
        body['apiKey'] = api_key
    elif protect:
        body['protect'] = True

    if tag:
        body['tag'] = tag

    if name:
        body['name'] = name

    res = requests.post(url, data=body)
    if res.status_code != 200:
        raise RazielError(res)

    return RazielFile(res.json())



def download_file(url, path, tag=None, version=None, force=False):
    params = {'format': 'stat'}
    if tag:
        params['tag'] = tag
    if version:
        params['version'] = version

    res = requests.get(url, params=params)

    if res.status_code != 200:
        raise RazielError(res)

    rf = RazielFile(res.json())

    if path is None:
        fp = sys.stdout.buffer
    else:
        if os.path.isdir(path):
            path = os.path.join(path, rf.name)

        if os.path.exists(path) and not force:
            print("raziel: cannot overwrite existing file:", path,
                  file=sys.stderr)
            return None

        fp = open(path, 'wb')

    del params['format']
    res = requests.get(url, params=params, stream=True)

    for chunk in res.iter_content(0xffff):
        fp.write(chunk)

    if path is not None:
        fp.close()

    return 0


def list_tree(url, skip=None, limit=None):
    params = {}
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


def stat_file(url, tag=None, version=None):
    params = {
        'format': 'stat'
    }

    if tag:
        params['tag'] = tag
    elif version:
        params['version'] = version

    res = requests.get(url, params=params)

    if res.status_code != 200:
        raise RazielError(res)

    data = res.json()
    rf = RazielFile(data)

    return rf


def list_history(url, limit=None, skip=None, reverse=False):
    params = {}
    if limit:
        params['limit'] = limit
    if skip:
        params['skip'] = skip

    res = requests.get(url, params=params)

    if res.status_code != 200:
        raise RazielError(res)

    history = [
        RazielFile(json.loads(line)) for line in res.text.split('\n') if line.strip()
    ]

    if reverse:
        history.reverse()

    return history


def run(args):
    rc = None
    url = normalize_url(args)
    if args.upload:
        return upload_file(url, args.upload, api_key=args.apikey,
                           tag=args.tag, name=args.name)
    elif args.list:
        tree = list_tree(url, skip=args.skip, limit=args.limit)
        if tree:
            tree.write()
        rc = 0
    elif args.stat:
        rf = stat_file(url, version=args.version, tag=args.tag)
        if rf:
            rc = 0
            rf.write()
        else:
            rc = -1
    elif args.history:
        history = list_history(url, skip=args.skip, limit=args.limit,
                               reverse=args.reverse)

        if history:
            for (i, item) in enumerate(history):
                if i > 0:
                    print()
                    print('----')
                item.write(level='short')

    elif args.download:
        return download_file(url, args.download, tag=args.tag,
                             version=args.version, force=args.force)


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
    parser.add_argument('-H', '--history', action='store_true',
                        help='list file history')

    parser.add_argument('url', help='raziel url')
    parser.add_argument('path', help='file path')

    args = parser.parse_args()

    if not (args.upload or args.list or args.stat or args.history
            or args.download):
        print("raziel: no command specified, must be one of -u, -l, or -s",
              file=sys.stderr)
        parser.print_help()
        sys.exit(1)

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
        print("raziel: fuck:", e, file=sys.stderr)
        rc = 1
    except requests.exceptions.Timeout:
        print("raziel: request timed out", file=sys.stderr)
        rc = -1
    except OSError as e:
        print("raziel:", e.strerror or str(e), file=sys.stderr)
        rc = -e.errno if e.errno else -1

    sys.exit(rc)

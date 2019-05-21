import Torrent from "../iso/Torrent";
import TorrentClient from "../iso/TorrentClient";
import UntrustedClient from "./UntrustedClient";

// Converts a file from WebTorrent file object to browser File object
async function convertFile(file: any, encoding?: string): Promise<File> {
  return await new Promise((resolve, reject) => {
    file.getBlob((err, blob) => {
      if (err) {
        reject(err);
      }
      resolve(new File([blob], file.name));
    });
  });
}

async function readAsText(file: File, encoding?: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = e => {
      resolve((e.target as any).result);
    };
    reader.readAsText(file, encoding);
  });
}

export default class Bucket {
  network: string;
  name: string;
  owner: string;
  size: number;
  magnet: string;
  torrentClient: TorrentClient;
  untrustedClient: UntrustedClient;
  torrent?: Torrent;
  torrentFiles?: { [filename: string]: any };
  files: { [filename: string]: File };
  downloadPending: boolean;

  constructor(
    network: string,
    name: string,
    owner: string,
    size: number,
    magnet: string,
    torrentClient: TorrentClient,
    untrustedClient: UntrustedClient
  ) {
    this.network = network;
    this.name = name;
    this.owner = owner;
    this.size = size;
    this.magnet = magnet;
    this.torrentClient = torrentClient;
    this.untrustedClient = untrustedClient;
    this.torrent = null;

    this.torrentFiles = null;

    // this.files is lazily instantiated from this.torrentFiles
    // If it does have an entry, however, that entry takes priority
    // over the torrentFiles entry.
    // This means we can set files locally while we are still waiting
    // for a bucket download
    this.files = {};

    // A bucket that is instantiated with a valid magnet is considered
    // to have its download pending.
    // A bucket that has no magnet, there's nothing to download.
    // Buckets only download once at most, so once the download is no
    // longer pending, it never will be.
    // If you need to refresh bucket data, make a new Bucket object.
    this.downloadPending = this.hasValidMagnet();
  }

  hasValidMagnet(): boolean {
    return this.magnet && this.magnet !== "";
  }

  // Downloads the entire contents of a bucket.
  // If a download is not needed this is a no-op, so it's safe to just
  // await this.download() at the start of data access functions.
  // For now this is the only way to get bucket contents, but for
  // efficiency this API could be extended to only download some of
  // the bucket.
  async download() {
    if (!this.downloadPending) {
      return;
    }
    this.torrent = this.torrentClient.download(this.magnet);
    await this.torrent.waitForDone();

    // We don't need to index the files twice if this is racey
    if (!this.downloadPending) {
      return;
    }
    this.torrentFiles = {};
    for (let file of this.torrent.torrent.files) {
      this.torrentFiles[file.name] = file;
    }
    this.downloadPending = false;
  }

  async upload() {
    // Get permission first so that the UI is snappy
    await this.untrustedClient.requestUpdateBucketPermission(this.name);

    // Finish any downloading before making a new torrent
    await this.download();

    // Get a list of all our files.
    // This also makes sure all data is cached in this.files, so we can drop torrentFiles
    let fileList: File[] = [];
    let filenames = await this.getFilenames();
    for (let filename of filenames) {
      fileList.push(await this.getFile(filename));
    }
    console.log("XXX fileList:", fileList);

    // Stop using the old download-centric torrent
    if (this.torrent) {
      this.torrent.destroy();
      this.torrent = null;
    }
    this.torrentFiles = null;

    // Start a new torrent
    this.torrent = await this.torrentClient.seed(fileList);
    console.log("XXX magnet:", this.torrent.magnet);
    console.log("XXX waiting for seeds");
    await this.torrent.waitForSeeds(1);

    // Update the magnet on the blockchain
    console.log("XXX updating the magnet");
    await this.untrustedClient.updateBucket(this.name, this.torrent.magnet);
  }

  async getFilenames(): Promise<string[]> {
    await this.download();
    let answer = [];
    for (let fname in this.files) {
      answer.push(fname);
    }
    if (this.torrentFiles) {
      for (let fname in this.torrentFiles) {
        if (!(fname in this.files)) {
          answer.push(fname);
        }
      }
    }
    answer.sort();
    return answer;
  }

  // Returns null if there is no such file.
  async getFile(filename: string): Promise<File> {
    await this.download();
    if (filename in this.files) {
      return this.files[filename];
    }
    if (this.torrentFiles && filename in this.torrentFiles) {
      this.files[filename] = await convertFile(this.torrentFiles[filename]);
      return this.files[filename];
    }
    return null;
  }

  // Returns null if there is no such file.
  async getText(filename: string, encoding?: string): Promise<string> {
    let file = await this.getFile(filename);
    if (!file) {
      return null;
    }

    return await readAsText(file, encoding);
  }

  // Returns null if there is no such file.
  // Throws an error if we haven't downloaded this bucket.
  // This has to be async because the browser file-reading APIs are async.
  async getJSON(filename: string): Promise<any> {
    let text = await this.getText(filename);
    return JSON.parse(text);
  }

  setFile(filename: string, file: File) {
    this.files[filename] = file;
  }

  // Only supports utf-8
  setText(filename: string, text: string) {
    let file = new File([text], filename);
    this.setFile(filename, file);
  }

  setJSON(filename: string, data: any) {
    let text = JSON.stringify(data);
    this.setText(filename, text);
  }
}

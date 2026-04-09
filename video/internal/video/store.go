package video

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/gridfs"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Store wraps MongoDB GridFS and the library collection.
type Store struct {
	bucket  *gridfs.Bucket
	library *mongo.Collection
}

// New returns a Store backed by the given database.
func New(db *mongo.Database) (*Store, error) {
	bucket, err := gridfs.NewBucket(db, options.GridFSBucket())
	if err != nil {
		return nil, fmt.Errorf("gridfs bucket: %w", err)
	}
	return &Store{bucket: bucket, library: db.Collection("library")}, nil
}

// Upload compresses the video bytes and stores them in GridFS under filename.
// The library record is also inserted. This is intended to run in a goroutine.
func (s *Store) Upload(filename string, raw []byte) {
	data := CompressVideo(raw)
	uploadStream, err := s.bucket.OpenUploadStream(filename, options.GridFSUpload().
		SetMetadata(bson.M{
			"contentType": "video/mp4",
			"compressed":  true,
		}),
	)
	if err != nil {
		slog.Error("gridfs open upload stream failed", "filename", filename, "err", err)
		return
	}
	if _, err := uploadStream.Write(data); err != nil {
		slog.Error("gridfs write failed", "filename", filename, "err", err)
		uploadStream.Abort()
		return
	}
	if err := uploadStream.Close(); err != nil {
		slog.Error("gridfs close failed", "filename", filename, "err", err)
		return
	}

	ctx := context.Background()
	if _, err := s.library.InsertOne(ctx, bson.M{"filename": filename}); err != nil {
		slog.Error("library insert failed", "filename", filename, "err", err)
	}
	slog.Info("video uploaded", "filename", filename, "bytes", len(data))
}

// Stream copies the GridFS file named filename into w and returns its length.
func (s *Store) Stream(ctx context.Context, w io.Writer, filename string) (int64, error) {
	var buf bytes.Buffer
	n, err := s.bucket.DownloadToStreamByName(filename, &buf)
	if err != nil {
		return 0, err
	}
	if _, err := io.Copy(w, &buf); err != nil {
		return 0, err
	}
	return n, nil
}

// Delete removes the GridFS file and the library record for the given filename.
func (s *Store) Delete(ctx context.Context, filename string) error {
	// Find the file's ObjectID in fs.files.
	var fileDoc bson.M
	err := s.bucket.GetFilesCollection().FindOne(ctx, bson.M{"filename": filename}).Decode(&fileDoc)
	if err == mongo.ErrNoDocuments {
		return fmt.Errorf("file not found: %s", filename)
	}
	if err != nil {
		return err
	}
	fileID := fileDoc["_id"]

	if err := s.bucket.Delete(fileID); err != nil {
		return fmt.Errorf("gridfs delete: %w", err)
	}
	if _, err := s.library.DeleteOne(ctx, bson.M{"filename": filename}); err != nil {
		slog.Warn("library delete failed", "filename", filename, "err", err)
	}
	return nil
}
